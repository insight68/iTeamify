#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART_DIR="$ROOT_DIR/deploy/helm/iteamify"

require_rendered_value() {
  local rendered=$1
  local expected=$2

  if ! grep -Fq "$expected" <<<"$rendered"; then
    echo "Missing expected Helm-rendered config value:"
    echo "  $expected"
    exit 1
  fi
}

helm lint "$CHART_DIR"

default_config="$(
  helm template iteamify "$CHART_DIR" \
    --show-only templates/configmap.yaml
)"
require_rendered_value "$default_config" 'ITEAMIFY_VCS_INTEGRATION_ENABLED: "true"'

disabled_config="$(
  helm template iteamify "$CHART_DIR" \
    --show-only templates/configmap.yaml \
    --set backend.config.vcsIntegrationEnabled=false
)"
require_rendered_value "$disabled_config" 'ITEAMIFY_VCS_INTEGRATION_ENABLED: "false"'

monitoring_rules="$(
  helm template iteamify "$CHART_DIR" \
    --show-only templates/prometheusrule.yaml \
    --set monitoring.prometheusRule.enabled=true
)"
require_rendered_value "$monitoring_rules" 'alert: iTeamifyStripeWebhookRateLimited'
require_rendered_value "$monitoring_rules" 'sum(increase(iteamify_webhook_rate_limited_total{gate="stripe_ip"}[5m])) > 0'

echo "helm config rendering ok"
