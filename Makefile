.PHONY: help \
  dev dev-web dev-desktop dev-mobile \
  build build-web build-desktop build-mobile \
  deploy_web deploy_web_preview deploy_desktop deploy_desktop_all \
  check typecheck test lint \
  setup start stop \
  clean clean-web clean-desktop clean-mobile

FRONTEND_PORT ?= 3000
MOBILE_DEV_PORT ?= 8081

.DEFAULT_GOAL := help

##@ Help

help: ## Show available make targets
	@awk 'BEGIN {FS = ":.*## "; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nQuick start:\n  \033[36mmake setup\033[0m        First-time project initialization\n  \033[36mmake dev\033[0m          Start web dev server\n  \033[36mmake check\033[0m        Run the verification pipeline\n\n"} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} \
		/^[a-zA-Z0-9_.-]+:.*## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ══════════════════════════════════════════════════════════════════════════════
##@ Development

dev: ## Start web dev server (alias for dev-web)
	@bash scripts/dev.sh web

dev-web: ## Start Next.js dev server
	@bash scripts/dev.sh web

dev-desktop: ## Start Electron dev server
	@bash scripts/dev.sh desktop

dev-mobile: ## Start React Native / Expo dev server
	@bash scripts/dev.sh mobile

start: ## Alias for dev-web (backward compat)
	@bash scripts/dev.sh web

# ══════════════════════════════════════════════════════════════════════════════
##@ Build

build: ## Build all apps (Turbo)
	pnpm build

build-web: ## Build web only
	pnpm build:web

build-desktop: ## Build desktop only
	pnpm build:desktop

build-mobile: ## Build mobile only
	pnpm build:mobile

# ══════════════════════════════════════════════════════════════════════════════
##@ Deploy & Package

deploy_web: ## Deploy web to Vercel (production)
	@bash scripts/deploy-web.sh

deploy_web_preview: ## Deploy web to Vercel (preview)
	@bash scripts/deploy-web.sh --preview

deploy_desktop: ## Package desktop app (current platform)
	pnpm --filter @teamify/desktop package

deploy_desktop_all: ## Package desktop app (all platforms)
	pnpm --filter @teamify/desktop package:all

# ══════════════════════════════════════════════════════════════════════════════
##@ Verification

check: ## Run typecheck + unit tests + lint
	@bash scripts/check.sh

typecheck: ## TypeScript type check only
	pnpm typecheck

test: ## Run unit tests only
	pnpm test

lint: ## ESLint only
	pnpm lint

# ══════════════════════════════════════════════════════════════════════════════
##@ Setup & Cleanup

setup: ## First-time setup (deps, env files)
	@bash scripts/setup.sh

stop: ## Stop dev servers
	@echo "Stopping dev servers..."
	@-lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(MOBILE_DEV_PORT) | xargs kill -9 2>/dev/null || true
	@echo "Done."

clean: ## Remove all generated files and node_modules
	pnpm clean

clean-web: ## Remove web build artifacts
	rm -rf apps/web/.next

clean-desktop: ## Remove desktop build artifacts
	rm -rf apps/desktop/out apps/desktop/dist

clean-mobile: ## Remove mobile build artifacts
	rm -rf apps/mobile/dist
