"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@iteamify/core/api";
import { useAuthStore } from "@iteamify/core/auth";
import { useCurrentWorkspace } from "@iteamify/core/paths";
import { memberListOptions } from "@iteamify/core/workspace/queries";
import {
  useUpdateWorkspaceOpenAgent,
  workspaceOpenAgentOptions,
  workspaceOpenAgentTestErrorCode,
} from "@iteamify/core/workspace";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import { useT } from "../../i18n";
import { SettingsCard, SettingsSection, SettingsTab } from "./settings-layout";

export function OpenAgentTab() {
  const { t } = useT("settings");
  const workspace = useCurrentWorkspace();
  const wsId = workspace?.id ?? "";
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const owner = members.some((m) => m.user_id === userId && m.role === "owner");
  const query = useQuery(workspaceOpenAgentOptions(wsId));
  const config = query.data;
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setAPIKey] = useState("");

  useEffect(() => {
    setBaseURL(config?.base_url ?? "");
    setModel(config?.model ?? "");
    setAPIKey("");
  }, [wsId, config]);

  const save = useUpdateWorkspaceOpenAgent(wsId);
  const input = () => ({
    expected_revision: config?.revision ?? 0,
    base_url: baseURL.trim(),
    model: model.trim(),
    ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
  });
  const testErrorMessage = (error: unknown) => {
    switch (workspaceOpenAgentTestErrorCode(error)) {
      case "network_policy": return t(($) => $.openagent.test_network_policy);
      case "dns_error": return t(($) => $.openagent.test_dns_error);
      case "connection_error": return t(($) => $.openagent.test_connection_error);
      case "timeout": return t(($) => $.openagent.test_timeout);
      case "tls_error": return t(($) => $.openagent.test_tls_error);
      case "authentication_error": return t(($) => $.openagent.test_authentication_error);
      case "quota_error": return t(($) => $.openagent.test_quota_error);
      case "endpoint_error": return t(($) => $.openagent.test_endpoint_error);
      case "rate_limit": return t(($) => $.openagent.test_rate_limit);
      case "invalid_request": return t(($) => $.openagent.test_invalid_request);
      case "invalid_response": return t(($) => $.openagent.test_invalid_response);
      case "provider_error": return t(($) => $.openagent.test_provider_error);
      default: return t(($) => $.openagent.test_error);
    }
  };
  const test = useMutation({
    mutationFn: () => api
      .withRequestContext({ workspaceId: wsId })
      .testWorkspaceOpenAgentConfig(wsId, input()),
    onSuccess: () => toast.success(t(($) => $.openagent.test_ok)),
    onError: (error) => toast.error(testErrorMessage(error)),
  });
  const pending = save.isPending || test.isPending;
  const valid = !!baseURL.trim() && !!model.trim()
    && (!!apiKey.trim() || config?.credential_configured === true);
  const submit = async () => {
    try {
      await save.mutateAsync(input());
      setAPIKey("");
      toast.success(t(($) => $.openagent.saved));
    } catch {
      toast.error(t(($) => $.openagent.save_error));
    }
  };

  return (
    <SettingsTab title="OpenAgent" description={t(($) => $.openagent.description)}>
      {!owner && (
        <p className="text-sm text-muted-foreground">{t(($) => $.openagent.owner_only)}</p>
      )}
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">{t(($) => $.openagent.load_error)}</p>
      ) : (
        <SettingsSection title={t(($) => $.openagent.connection)}>
          <SettingsCard>
            <div className="space-y-5 p-5">
              <div className="space-y-2">
                <Label htmlFor="openagent-base-url">{t(($) => $.openagent.base_url)}</Label>
                <Input id="openagent-base-url" type="url" value={baseURL}
                  disabled={!owner || pending || !config}
                  onChange={(e) => { setBaseURL(e.target.value); test.reset(); }}
                  placeholder="https://provider.example.com/anthropic" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openagent-model">{t(($) => $.openagent.model)}</Label>
                <Input id="openagent-model" value={model}
                  disabled={!owner || pending || !config}
                  onChange={(e) => { setModel(e.target.value); test.reset(); }} />
              </div>
              {owner && (
                <div className="space-y-2">
                  <Label htmlFor="openagent-api-key">{t(($) => $.openagent.api_key)}</Label>
                  <Input id="openagent-api-key" type="password" autoComplete="new-password"
                    value={apiKey} disabled={pending || !config}
                    onChange={(e) => { setAPIKey(e.target.value); test.reset(); }}
                    placeholder={config?.credential_configured ? t(($) => $.openagent.key_keep) : ""} />
                  <p className="text-xs text-muted-foreground">{t(($) => $.openagent.key_hint)}</p>
                </div>
              )}
              {test.isError && (
                <p role="alert" className="text-sm text-destructive">{testErrorMessage(test.error)}</p>
              )}
              {owner && (
                <div className="flex gap-2">
                  <Button variant="outline" disabled={!valid || pending || !config}
                    onClick={() => test.mutate()}>{t(($) => $.openagent.test)}</Button>
                  <Button disabled={!valid || pending || !config}
                    onClick={() => void submit()}>{t(($) => $.openagent.save)}</Button>
                </div>
              )}
            </div>
          </SettingsCard>
        </SettingsSection>
      )}
    </SettingsTab>
  );
}
