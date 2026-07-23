# Dwarpal — developer & demo commands.
#
# The Makefile is the interface to the project: bring it up, tail logs, tear it
# down, reset. Demo/attack targets get added as those pieces land.

.DEFAULT_GOAL := help
.PHONY: help init up down nuke logs ps dev migrate seed

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

init: ## Create .env from .env.example if it doesn't exist
	@test -f .env || cp .env.example .env
	@echo ".env ready"

up: ## Build and start the full stack (detached)
	docker compose up -d --build

down: ## Stop and remove containers (keeps volumes)
	docker compose down

nuke: ## Stop everything and wipe volumes — a clean slate
	docker compose down -v --remove-orphans

migrate: ## Run database migrations (inside the proxy container)
	docker compose exec proxy node src/db/migrate.js

seed: ## Fill the database with ~24h of history + an attack spike
	docker compose exec proxy node src/scripts/seed.js

logs: ## Tail logs from all services
	docker compose logs -f

ps: ## Show container status
	docker compose ps

dev: ## Run the proxy locally (no containers) against localhost backends
	node --watch src/index.js
