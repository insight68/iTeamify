package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type CatalogTool struct {
	Surface     string          `json:"surface"`
	ServerName  string          `json:"server_name"`
	Name        string          `json:"name"`
	Domain      string          `json:"domain"`
	AccessMode  string          `json:"access_mode"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

type catalogToolMetadata struct {
	domain     string
	accessMode string
}

var normalCatalogMetadata = map[string]catalogToolMetadata{
	"web_search":              {domain: "web", accessMode: "read"},
	"web_fetch":               {domain: "web", accessMode: "read"},
	"company_context_get":     {domain: "company", accessMode: "read"},
	"company_profile_get":     {domain: "company", accessMode: "read"},
	"company_profile_update":  {domain: "company", accessMode: "write"},
	"resource_catalog":        {domain: "resources", accessMode: "read"},
	"resource_describe":       {domain: "resources", accessMode: "read"},
	"resource_query":          {domain: "resources", accessMode: "read"},
	"resource_get":            {domain: "resources", accessMode: "read"},
	"resource_action_preview": {domain: "resources", accessMode: "preview"},
	"resource_action_execute": {domain: "resources", accessMode: "write"},
}

var (
	normalCatalogOnce  sync.Once
	normalCatalogTools []CatalogTool
	normalCatalogErr   error
)

// Catalog returns the exact in-memory tool registry exposed by the complete
// first-party server. It never opens a listener or calls the backend.
func Catalog() ([]CatalogTool, error) {
	normalCatalogOnce.Do(func() {
		normalCatalogTools, normalCatalogErr = buildCatalog()
	})
	if normalCatalogErr != nil {
		return nil, normalCatalogErr
	}
	return cloneCatalog(normalCatalogTools), nil
}

func buildCatalog() ([]CatalogTool, error) {
	ctx := context.Background()
	server := New(catalogAPIClient{}, "catalog")
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect catalog server: %w", err)
	}
	defer serverSession.Close()

	client := mcp.NewClient(&mcp.Implementation{Name: "iteamify-catalog", Version: "catalog"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect catalog client: %w", err)
	}
	defer clientSession.Close()

	listed, err := clientSession.ListTools(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("list catalog tools: %w", err)
	}
	tools := make([]CatalogTool, 0, len(listed.Tools))
	seen := make(map[string]struct{}, len(listed.Tools))
	for _, tool := range listed.Tools {
		metadata, ok := normalCatalogMetadata[tool.Name]
		if !ok {
			return nil, fmt.Errorf("tool %q has no catalog metadata", tool.Name)
		}
		if _, duplicate := seen[tool.Name]; duplicate {
			return nil, fmt.Errorf("tool %q is registered more than once", tool.Name)
		}
		seen[tool.Name] = struct{}{}
		schema, err := json.Marshal(tool.InputSchema)
		if err != nil {
			return nil, fmt.Errorf("encode input schema for %s: %w", tool.Name, err)
		}
		tools = append(tools, CatalogTool{
			Surface:     "agent_task",
			ServerName:  "iteamify",
			Name:        tool.Name,
			Domain:      metadata.domain,
			AccessMode:  metadata.accessMode,
			Description: tool.Description,
			InputSchema: schema,
		})
	}
	if len(seen) != len(normalCatalogMetadata) {
		return nil, fmt.Errorf("catalog metadata has %d tools but registry has %d", len(normalCatalogMetadata), len(seen))
	}
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })
	return tools, nil
}

func cloneCatalog(source []CatalogTool) []CatalogTool {
	result := make([]CatalogTool, len(source))
	for i, tool := range source {
		result[i] = tool
		result[i].InputSchema = append(json.RawMessage(nil), tool.InputSchema...)
	}
	return result
}

type catalogAPIClient struct{}

func (catalogAPIClient) GetJSON(context.Context, string, any) error {
	return fmt.Errorf("catalog client cannot call the backend")
}

func (catalogAPIClient) PostJSON(context.Context, string, any, any) error {
	return fmt.Errorf("catalog client cannot call the backend")
}

func (catalogAPIClient) DeleteJSONWithBodyResult(context.Context, string, any, any) error {
	return fmt.Errorf("catalog client cannot call the backend")
}
