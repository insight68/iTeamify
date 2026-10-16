import { describe, expect, it } from "vitest";
import {
  ComposioConnectionListSchema,
  ComposioToolkitListSchema,
  ListLarkInstallationsResponseSchema,
  ListSlackInstallationsResponseSchema,
  ListVCSConnectionsResponseSchema,
  ListGmailConnectionsResponseSchema,
  EMPTY_LIST_GMAIL_CONNECTIONS_RESPONSE,
} from "./schemas";
import { parseWithFallback } from "./schema";

describe("connection API compatibility schemas", () => {
  it("defaults omitted VCS capability fields without rejecting additive fields", () => {
    const result = ListVCSConnectionsResponseSchema.parse({
      connections: [],
      future_capability: true,
    });
    expect(result).toMatchObject({
      connections: [],
      configured: false,
      can_manage: false,
      future_capability: true,
    });
  });

  it("keeps older channel-list responses readable", () => {
    expect(ListLarkInstallationsResponseSchema.parse({ configured: true })).toEqual({
      configured: true,
      installations: [],
    });
    expect(ListSlackInstallationsResponseSchema.parse({ configured: false })).toEqual({
      configured: false,
      installations: [],
    });
  });

  it("parses additive Composio toolkit and connection payloads", () => {
    expect(
      ComposioToolkitListSchema.parse([
        { slug: "gmail", name: "Gmail", future_field: "kept" },
      ]),
    ).toEqual([
      {
        slug: "gmail",
        name: "Gmail",
        connectable: false,
        future_field: "kept",
      },
    ]);
    expect(
      ComposioConnectionListSchema.parse([
        {
          id: "connection-1",
          toolkit_slug: "gmail",
          status: "active",
          connected_at: "2026-08-15T00:00:00Z",
          future_field: 1,
        },
      ]),
    ).toHaveLength(1);
  });

  it("keeps native Gmail connection payloads forward compatible", () => {
    expect(
      ListGmailConnectionsResponseSchema.parse({
        configured: true,
        connections: [
          {
            id: "gmail-1",
            email_address: "owner@example.com",
            status: "active",
            connected_at: "2026-08-15T00:00:00Z",
            future_field: true,
          },
        ],
      }),
    ).toMatchObject({
      configured: true,
      analysis_configured: false,
      connections: [{ analysis_enabled: true, message_count: 0, analyzed_count: 0 }],
    });
  });

  it("falls back safely when the native Gmail list is malformed", () => {
    const result = parseWithFallback(
      { configured: true, connections: "not-an-array" },
      ListGmailConnectionsResponseSchema,
      EMPTY_LIST_GMAIL_CONNECTIONS_RESPONSE,
      { endpoint: "GET /api/integrations/gmail/connections", redactReceived: true },
    );
    expect(result).toBe(EMPTY_LIST_GMAIL_CONNECTIONS_RESPONSE);
  });
});
