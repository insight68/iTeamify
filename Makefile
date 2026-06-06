.PHONY: help dev setup start stop check build test clean

FRONTEND_PORT ?= 3000
FRONTEND_ORIGIN ?= http://localhost:$(FRONTEND_PORT)

ENV_FILE ?= .env

ifneq ($(wildcard $(ENV_FILE)),)
include $(ENV_FILE)
endif

export

define REQUIRE_ENV
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo "Missing env file: $(ENV_FILE)"; \
		echo "Create .env from .env.example."; \
		exit 1; \
	fi
endef

.DEFAULT_GOAL := help

##@ Help

help: ## Show available make targets
	@awk 'BEGIN {FS = ":.*## "; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nQuick start:\n  \033[36mmake dev\033[0m          Bootstrap and start the frontend\n  \033[36mmake check\033[0m        Run the verification pipeline\n\n"} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} \
		/^[a-zA-Z0-9_.-]+:.*## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- One-click commands ----------
##@ One-click

setup: ## Install dependencies and ensure .env exists
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo "==> Creating $(ENV_FILE) from .env.example..."; \
		cp .env.example "$(ENV_FILE)"; \
	fi
	@echo "==> Installing dependencies..."
	pnpm install
	@echo ""
	@echo "✓ Setup complete! Run 'make start' to launch the frontend."

start: ## Start the frontend dev server
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)"
	pnpm dev:web

stop: ## Stop frontend processes
	@echo "Stopping frontend..."
	@-lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null
	@echo "✓ Frontend stopped."

check: ## Run typecheck, unit tests, and lint
	@bash scripts/check.sh

# ---------- Individual commands ----------
##@ Individual commands

dev: ## Bootstrap and start the frontend (one command)
	@bash scripts/dev.sh

build: ## Build all frontend apps
	pnpm build

test: ## Run TypeScript unit tests
	pnpm test

# Cleanup
##@ Cleanup

clean: ## Remove generated files and node_modules
	pnpm clean
