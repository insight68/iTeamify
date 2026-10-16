package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

// Client manages connections to MCP servers.
type Client struct {
	mu                sync.RWMutex
	connections       map[string]*Connection
	inheritProcessEnv bool
	closed            bool
}

// ClientOptions controls host state inherited by stdio MCP processes.
type ClientOptions struct {
	// InheritProcessEnv preserves the standalone SDK's historical behavior.
	// Shared runtimes must leave this false and supply an explicit per-server
	// environment instead.
	InheritProcessEnv bool
}

// Connection represents a live connection to an MCP server.
type Connection struct {
	Name      string
	Config    types.MCPServerConfig
	Status    types.MCPServerStatus
	Tools     []types.MCPToolDefinition
	Error     string
	cleanup   func()
	closeOnce sync.Once
	gateOnce  sync.Once
	stdioGate chan struct{}

	// For stdio transport
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	reader *bufio.Reader

	// For HTTP transport
	httpClient *http.Client
	baseURL    string

	// JSON-RPC state
	nextID int
	mu     sync.Mutex
}

// JSONRPCRequest is a JSON-RPC 2.0 request.
type JSONRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// JSONRPCResponse is a JSON-RPC 2.0 response.
type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

// JSONRPCError is a JSON-RPC error.
type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// NewClient creates a new MCP client manager.
func NewClient() *Client {
	return NewClientWithOptions(ClientOptions{InheritProcessEnv: true})
}

// NewClientWithOptions creates an MCP client with an explicit host inheritance
// policy. The zero value is fail-closed.
func NewClientWithOptions(opts ClientOptions) *Client {
	return &Client{
		connections:       make(map[string]*Connection),
		inheritProcessEnv: opts.InheritProcessEnv,
	}
}

// ConnectServer connects to an MCP server.
func (c *Client) ConnectServer(ctx context.Context, name string, config types.MCPServerConfig) (*Connection, error) {
	c.mu.RLock()
	closed := c.closed
	c.mu.RUnlock()
	if closed {
		return nil, fmt.Errorf("MCP client is closed")
	}
	transportType := config.Type
	if transportType == "" {
		if config.Command != "" {
			transportType = types.MCPTransportStdio
		} else if config.URL != "" {
			transportType = types.MCPTransportHTTP
		}
	}

	var conn *Connection
	var err error

	switch transportType {
	case types.MCPTransportStdio:
		conn, err = c.connectStdio(ctx, name, config)
	case types.MCPTransportHTTP, types.MCPTransportSSE:
		conn, err = c.connectHTTP(ctx, name, config)
	default:
		return nil, fmt.Errorf("unsupported MCP transport type: %s", transportType)
	}

	if err != nil {
		return &Connection{
			Name:   name,
			Config: config,
			Status: types.MCPStatusError,
			Error:  err.Error(),
		}, err
	}

	// Fetch available tools
	tools, err := conn.ListTools(ctx)
	if err != nil {
		if conn.cleanup != nil {
			conn.close()
		}
		return nil, fmt.Errorf("list tools for MCP server %q: %w", name, err)
	}
	conn.Tools = tools

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		conn.close()
		return nil, fmt.Errorf("MCP client is closed")
	}
	previous := c.connections[name]
	c.connections[name] = conn
	c.mu.Unlock()
	if previous != nil {
		previous.close()
	}

	return conn, nil
}

// connectStdio connects to an MCP server via stdio.
func (c *Client) connectStdio(ctx context.Context, name string, config types.MCPServerConfig) (*Connection, error) {
	cmd := exec.CommandContext(ctx, config.Command, config.Args...)

	cmd.Env = c.stdioEnvironment(config)
	cmd.WaitDelay = time.Second

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start process: %w", err)
	}

	conn := &Connection{
		Name:   name,
		Config: config,
		Status: types.MCPStatusConnected,
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
		reader: bufio.NewReader(stdout),
		cleanup: func() {
			_ = stdin.Close()
			_ = stdout.Close()
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		},
	}

	// Send initialize request
	initResult, err := conn.sendRequest(ctx, "initialize", map[string]interface{}{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]interface{}{},
		"clientInfo": map[string]interface{}{
			"name":    "open-agent-sdk-go",
			"version": "0.1.0",
		},
	})
	if err != nil {
		conn.close()
		return nil, fmt.Errorf("initialize: %w", err)
	}

	// Send initialized notification
	_ = conn.sendNotification("notifications/initialized", nil)

	_ = initResult
	return conn, nil
}

func (c *Client) stdioEnvironment(config types.MCPServerConfig) []string {
	// Shared runtimes must not leak daemon credentials to MCP children. An
	// isolated client starts from an explicitly empty environment; standalone
	// SDK callers retain the historical inheritance behavior through NewClient.
	environment := make([]string, 0, len(config.Env))
	if c.inheritProcessEnv {
		environment = append(environment, os.Environ()...)
	}
	for k, v := range config.Env {
		environment = append(environment, k+"="+v)
	}
	return environment
}

var isolatedHTTPTransport = func() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	return transport
}()

// connectHTTP connects to an MCP server via HTTP.
func (c *Client) connectHTTP(ctx context.Context, name string, config types.MCPServerConfig) (*Connection, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	if !c.inheritProcessEnv {
		client.Transport = isolatedHTTPTransport
	}
	conn := &Connection{
		Name:       name,
		Config:     config,
		Status:     types.MCPStatusConnected,
		httpClient: client,
		baseURL:    strings.TrimRight(config.URL, "/"),
		cleanup:    func() {},
	}

	return conn, nil
}

// GetConnection returns a connection by name.
func (c *Client) GetConnection(name string) *Connection {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connections[name]
}

// AllConnections returns all connections.
func (c *Client) AllConnections() []*Connection {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := make([]*Connection, 0, len(c.connections))
	for _, conn := range c.connections {
		result = append(result, conn)
	}
	return result
}

// AllTools returns tools from all connected servers, prefixed with server name.
func (c *Client) AllTools() []types.MCPToolDefinition {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var tools []types.MCPToolDefinition
	for _, conn := range c.connections {
		if conn.Status != types.MCPStatusConnected {
			continue
		}
		for _, t := range conn.Tools {
			prefixed := t
			prefixed.Name = fmt.Sprintf("mcp__%s__%s", conn.Name, t.Name)
			tools = append(tools, prefixed)
		}
	}
	return tools
}

// Close disconnects all servers.
func (c *Client) Close() {
	c.mu.Lock()
	c.closed = true
	connections := c.connections
	c.connections = make(map[string]*Connection)
	c.mu.Unlock()
	for _, conn := range connections {
		conn.close()
	}
}

// ListTools fetches the list of available tools from the server.
func (conn *Connection) ListTools(ctx context.Context) ([]types.MCPToolDefinition, error) {
	result, err := conn.sendRequest(ctx, "tools/list", nil)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Tools []struct {
			Name        string                 `json:"name"`
			Description string                 `json:"description"`
			InputSchema map[string]interface{} `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal tools: %w", err)
	}

	tools := make([]types.MCPToolDefinition, len(resp.Tools))
	for i, t := range resp.Tools {
		schema := types.ToolInputSchema{
			Type: "object",
		}
		if props, ok := t.InputSchema["properties"].(map[string]interface{}); ok {
			schema.Properties = props
		}
		if req, ok := t.InputSchema["required"].([]interface{}); ok {
			for _, r := range req {
				if s, ok := r.(string); ok {
					schema.Required = append(schema.Required, s)
				}
			}
		}
		tools[i] = types.MCPToolDefinition{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: schema,
		}
	}

	return tools, nil
}

// CallTool executes a tool on the MCP server.
func (conn *Connection) CallTool(ctx context.Context, toolName string, input map[string]interface{}) (*types.MCPToolCallResult, error) {
	result, err := conn.sendRequest(ctx, "tools/call", map[string]interface{}{
		"name":      toolName,
		"arguments": input,
	})
	if err != nil {
		return nil, err
	}

	var resp types.MCPToolCallResult
	if err := json.Unmarshal(result, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal tool result: %w", err)
	}

	return &resp, nil
}

// sendRequest sends a JSON-RPC request and waits for a response.
func (conn *Connection) sendRequest(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	conn.mu.Lock()
	conn.nextID++
	id := conn.nextID
	conn.mu.Unlock()

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	// Stdio transport
	if conn.stdin != nil {
		return conn.sendStdioRequest(ctx, req)
	}

	// HTTP transport
	if conn.httpClient != nil {
		return conn.sendHTTPRequest(ctx, req)
	}

	return nil, fmt.Errorf("no transport available")
}

func (conn *Connection) sendStdioRequest(ctx context.Context, req JSONRPCRequest) (json.RawMessage, error) {
	conn.gateOnce.Do(func() { conn.stdioGate = make(chan struct{}, 1) })
	select {
	case conn.stdioGate <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	defer func() { <-conn.stdioGate }()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	stopClose := context.AfterFunc(ctx, conn.close)
	defer stopClose()

	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	// Write request
	if _, err := conn.stdin.Write(append(data, '\n')); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("write request: %w", err)
	}

	// Cancellation invalidates the stream: a late response must never be
	// consumed by a later call. Closing the pipes also releases blocked reads.
	for notifications := 0; notifications < 100; notifications++ {
		line, err := readRPCLine(conn.reader)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return nil, fmt.Errorf("read response: %w", err)
		}
		var resp JSONRPCResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			return nil, fmt.Errorf("unmarshal response: %w", err)
		}
		if resp.ID == 0 && resp.Result == nil && resp.Error == nil {
			continue
		}
		if resp.JSONRPC != "2.0" || resp.ID != req.ID {
			conn.close()
			return nil, fmt.Errorf("JSON-RPC response id mismatch: got %d, want %d", resp.ID, req.ID)
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("JSON-RPC error %d: %s", resp.Error.Code, resp.Error.Message)
		}
		return resp.Result, nil
	}
	return nil, fmt.Errorf("too many MCP notifications before response")
}

func (conn *Connection) sendHTTPRequest(ctx context.Context, req JSONRPCRequest) (json.RawMessage, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, conn.baseURL, strings.NewReader(string(data)))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	for k, v := range conn.Config.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := conn.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRPCResponseBytes+1))
	if len(body) > maxRPCResponseBytes {
		return nil, fmt.Errorf("MCP response exceeds size limit")
	}
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var jsonResp JSONRPCResponse
	if err := json.Unmarshal(body, &jsonResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	if jsonResp.JSONRPC != "2.0" || jsonResp.ID != req.ID {
		return nil, fmt.Errorf("JSON-RPC response id mismatch: got %d, want %d", jsonResp.ID, req.ID)
	}
	if jsonResp.Error != nil {
		return nil, fmt.Errorf("JSON-RPC error %d: %s", jsonResp.Error.Code, jsonResp.Error.Message)
	}

	return jsonResp.Result, nil
}

// sendNotification sends a JSON-RPC notification (no response expected).
func (conn *Connection) sendNotification(method string, params interface{}) error {
	req := struct {
		JSONRPC string      `json:"jsonrpc"`
		Method  string      `json:"method"`
		Params  interface{} `json:"params,omitempty"`
	}{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}

	data, err := json.Marshal(req)
	if err != nil {
		return err
	}

	if conn.stdin != nil {
		_, err = conn.stdin.Write(append(data, '\n'))
		return err
	}

	return nil
}

const maxRPCResponseBytes = 32 << 20

func (conn *Connection) close() {
	conn.closeOnce.Do(func() {
		if conn.cleanup != nil {
			conn.cleanup()
		}
	})
}

func readRPCLine(reader *bufio.Reader) ([]byte, error) {
	var line []byte
	for {
		part, more, err := reader.ReadLine()
		if err != nil {
			return nil, err
		}
		if len(part) > maxRPCResponseBytes-len(line) {
			return nil, fmt.Errorf("MCP response exceeds size limit")
		}
		line = append(line, part...)
		if !more {
			return line, nil
		}
	}
}
