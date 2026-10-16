package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"sort"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type fakeAPIClient struct {
	getPath    string
	postPath   string
	postBody   any
	deletePath string
	deleteBody any
}

type recordedInvocationReport struct {
	invocationID string
	toolName     string
	succeeded    bool
	durationMS   int64
}

type reportingAPIClient struct {
	fakeAPIClient
	reports   []recordedInvocationReport
	reportErr error
}

func (f *reportingAPIClient) ReportMCPToolInvocation(_ context.Context, invocationID, toolName string, succeeded bool, durationMS int64) error {
	f.reports = append(f.reports, recordedInvocationReport{
		invocationID: invocationID,
		toolName:     toolName,
		succeeded:    succeeded,
		durationMS:   durationMS,
	})
	return f.reportErr
}

func (f *fakeAPIClient) GetJSON(_ context.Context, path string, out any) error {
	f.getPath = path
	return assignJSON(out, map[string]any{"ok": true, "path": path})
}

func (f *fakeAPIClient) PostJSON(_ context.Context, path string, body any, out any) error {
	f.postPath = path
	f.postBody = body
	return assignJSON(out, map[string]any{"id": "quote-id", "public_url": "https://example.test/purchase/token"})
}

func (f *fakeAPIClient) DeleteJSONWithBodyResult(_ context.Context, path string, body any, out any) error {
	f.deletePath = path
	f.deleteBody = body
	return assignJSON(out, map[string]any{"ok": true, "path": path})
}

func assignJSON(out, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

func connectTestClient(t *testing.T, api APIClient) *mcp.ClientSession {
	t.Helper()
	return connectTestServer(t, New(api, "test"))
}

func connectTestServer(t *testing.T, server *mcp.Server) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("connect server: %v", err)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "test"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		serverSession.Close()
		t.Fatalf("connect client: %v", err)
	}
	t.Cleanup(func() {
		clientSession.Close()
		serverSession.Close()
	})
	return clientSession
}

func TestManagedToolInventoryUsesReleaseAllowlist(t *testing.T) {
	session := connectTestServer(t, NewWithToolAllowlist(&fakeAPIClient{}, "test", []string{"resource_get", "resource_action_preview"}))
	result, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	names := make([]string, 0, len(result.Tools))
	for _, tool := range result.Tools {
		names = append(names, tool.Name)
	}
	sort.Strings(names)
	if want := []string{"resource_action_preview", "resource_get"}; !reflect.DeepEqual(names, want) {
		t.Fatalf("tool names = %#v, want %#v", names, want)
	}
}

func TestManagedWebToolsUseTaskScopedBackendAndPreserveInput(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestServer(t, NewWithToolAllowlist(api, "test", []string{"web_search", "web_fetch"}))
	for _, tc := range []struct{ name, path, arguments string }{
		{"web_search", "/api/chat/web/search", `{"query":"苏州自动化公司","max_results":3}`},
		{"web_fetch", "/api/chat/web/fetch", `{"url":"https://example.com/about"}`},
	} {
		result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: tc.name, Arguments: json.RawMessage(tc.arguments)})
		if err != nil || result.IsError || api.postPath != tc.path {
			t.Fatalf("tool = %s path = %s result = %#v error = %v", tc.name, api.postPath, result, err)
		}
		got, _ := json.Marshal(api.postBody)
		var before, after map[string]any
		_ = json.Unmarshal([]byte(tc.arguments), &before)
		_ = json.Unmarshal(got, &after)
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("input = %s want = %s", got, tc.arguments)
		}
	}
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "resource_action_execute", Arguments: json.RawMessage(`{}`)})
	if err == nil && !result.IsError {
		t.Fatal("web-only session admitted business writes")
	}
}

func TestToolInventoryIsAllowlisted(t *testing.T) {
	session := connectTestClient(t, &fakeAPIClient{})
	result, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	names := make([]string, 0, len(result.Tools))
	for _, tool := range result.Tools {
		names = append(names, tool.Name)
	}
	sort.Strings(names)
	want := []string{
		"company_context_get", "company_profile_get", "company_profile_update",
		"resource_action_execute", "resource_action_preview", "resource_catalog", "resource_describe", "resource_get", "resource_query",
		"web_fetch", "web_search",
	}
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("tool names = %#v, want %#v", names, want)
	}
}

func TestCatalogMatchesExactToolInventory(t *testing.T) {
	tools, err := Catalog()
	if err != nil {
		t.Fatalf("Catalog: %v", err)
	}
	if len(tools) != 11 {
		t.Fatalf("catalog tool count = %d, want 11", len(tools))
	}
	for _, tool := range tools {
		if tool.Surface != "agent_task" || tool.ServerName != "iteamify" || tool.Domain == "" {
			t.Errorf("invalid catalog descriptor: %#v", tool)
		}
		if tool.AccessMode != "read" && tool.AccessMode != "preview" && tool.AccessMode != "write" {
			t.Errorf("tool %q access mode = %q", tool.Name, tool.AccessMode)
		}
		if !json.Valid(tool.InputSchema) {
			t.Errorf("tool %q input schema is invalid JSON", tool.Name)
		}
	}
}

func TestToolInvocationTelemetryPreservesSuccessAndFailure(t *testing.T) {
	api := &reportingAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "resource_catalog", Arguments: json.RawMessage(`{}`),
	})
	if err != nil || result.IsError {
		t.Fatalf("resource_catalog result = %#v, err = %v", result, err)
	}
	result, err = session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "resource_action_execute", Arguments: json.RawMessage(`{"resource":"company_profile","action":"create","confirmed":true}`),
	})
	if err != nil || !result.IsError {
		t.Fatalf("resource_action_execute result = %#v, err = %v", result, err)
	}
	if len(api.reports) != 2 {
		t.Fatalf("reports = %#v", api.reports)
	}
	if api.reports[0].toolName != "resource_catalog" || !api.reports[0].succeeded || api.reports[0].invocationID == "" || api.reports[0].durationMS < 0 {
		t.Errorf("success report = %#v", api.reports[0])
	}
	if api.reports[1].toolName != "resource_action_execute" || api.reports[1].succeeded || api.reports[1].invocationID == "" || api.reports[1].durationMS < 0 {
		t.Errorf("failure report = %#v", api.reports[1])
	}
}

func TestToolInvocationTelemetryFailureDoesNotChangeToolResult(t *testing.T) {
	api := &reportingAPIClient{reportErr: errors.New("telemetry unavailable")}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "resource_catalog", Arguments: json.RawMessage(`{}`),
	})
	if err != nil || result.IsError {
		t.Fatalf("resource_catalog result = %#v, err = %v", result, err)
	}
}

func TestResourceQueryUsesGenericGateway(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "resource_query",
		Arguments: json.RawMessage(`{
			"resource":"company_profile",
			"search":"Acme",
			"filters":{"opportunity_stage":"qualified"},
			"limit":10
		}`),
	})
	if err != nil {
		t.Fatalf("call resource_query: %v", err)
	}
	if result.IsError {
		t.Fatalf("resource_query returned a tool error: %#v", result.Content)
	}
	if api.postPath != "/api/resources/query" {
		t.Fatalf("post path = %q", api.postPath)
	}
	input, ok := api.postBody.(ResourceQueryInput)
	if !ok || input.Resource != "company_profile" || input.Filters["opportunity_stage"] != "qualified" {
		t.Fatalf("post body = %#v", api.postBody)
	}
}

func TestResourceActionExecuteRequiresIdempotencyKeyBeforeHTTP(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "resource_action_execute",
		Arguments: json.RawMessage(`{"resource":"company_profile","action":"create","confirmed":true,"input":{"display_name":"Acme"}}`),
	})
	if err != nil {
		t.Fatalf("call resource_action_execute: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected tool error, got %#v", result)
	}
	if api.postPath != "" {
		t.Fatalf("unexpected API call to %q", api.postPath)
	}
}

func TestResourceActionExecutePreservesStructuredSubmissionIntent(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "resource_action_execute", Arguments: json.RawMessage(`{"resource":"contract_review","resource_id":"review","action":"accept","confirmed":true,"expected_version":1,"idempotency_key":"one-operation","user_intent_submission_id":"submission"}`)})
	if err != nil || result.IsError {
		t.Fatalf("execute: %v %+v", err, result)
	}
	body, _ := json.Marshal(api.postBody)
	var decoded map[string]any
	json.Unmarshal(body, &decoded)
	if decoded["user_intent_submission_id"] != "submission" || decoded["user_intent_message_id"] != nil {
		t.Fatalf("intent changed: %s", body)
	}
}

func TestCompanyProfileUpdateUsesTaskScopedLiveEndpoint(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "company_profile_update",
		Arguments: json.RawMessage(`{
			"base_revision":3,
			"title":"Refine agency ICP",
			"operations":[{"op":"replace","path":"/audiences","value":[]}],
			"confirmed":true
		}`),
	})
	if err != nil {
		t.Fatalf("call company_profile_update: %v", err)
	}
	if result.IsError {
		t.Fatalf("company_profile_update returned a tool error: %#v", result.Content)
	}
	if api.postPath != "/api/chat/company/profile" {
		t.Fatalf("post path = %q", api.postPath)
	}
}

func TestCompanyProfileUpdateRequiresExplicitConfirmation(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "company_profile_update",
		Arguments: json.RawMessage(`{
			"base_revision":3,
			"title":"Refine agency ICP",
			"operations":[{"op":"replace","path":"/audiences","value":[]}]
		}`),
	})
	if err != nil {
		t.Fatalf("call company_profile_update: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected confirmation error, got %#v", result)
	}
	if api.postPath != "" {
		t.Fatalf("unexpected API call to %q", api.postPath)
	}
}

func TestCompanyProfileUpdateRejectsSingleObjectForOffersBeforeHTTP(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "company_profile_update",
		Arguments: json.RawMessage(`{
			"base_revision":3,
			"title":"Add procurement assistant",
			"operations":[{"op":"add","path":"/offers","value":{"name":"Procurement assistant"}}],
			"confirmed":true
		}`),
	})
	if err != nil {
		t.Fatalf("call company_profile_update: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected schema error, got %#v", result)
	}
	if api.postPath != "" {
		t.Fatalf("invalid collection shape reached API at %q", api.postPath)
	}
}

func TestCompanyProfileGetUsesCurrentProfileEndpoint(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "company_profile_get",
		Arguments: json.RawMessage(`{"scopes":["identity","positioning"]}`),
	})
	if err != nil {
		t.Fatalf("call company_profile_get: %v", err)
	}
	if result.IsError {
		t.Fatalf("company_profile_get returned a tool error: %#v", result.Content)
	}
	if api.postPath != "/api/chat/company/profile/context" {
		t.Fatalf("post path = %q", api.postPath)
	}
}

func TestCompanyContextUsesScopedPublishedEndpoint(t *testing.T) {
	api := &fakeAPIClient{}
	session := connectTestClient(t, api)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "company_context_get",
		Arguments: json.RawMessage(`{"scopes":["offers","audiences"],"offer_ids":["offer-1"]}`),
	})
	if err != nil {
		t.Fatalf("call company_context_get: %v", err)
	}
	if result.IsError {
		t.Fatalf("company_context_get returned a tool error: %#v", result.Content)
	}
	if api.postPath != "/api/chat/company/context" {
		t.Fatalf("post path = %q", api.postPath)
	}
	input, ok := api.postBody.(CompanyContextGetInput)
	if !ok || !reflect.DeepEqual(input.Scopes, []string{"offers", "audiences"}) || !reflect.DeepEqual(input.OfferIDs, []string{"offer-1"}) {
		t.Fatalf("post body = %#v", api.postBody)
	}
}
