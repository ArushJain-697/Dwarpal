# Dwarpal — developer & demo commands.
#
# The Makefile is the interface to the project: bring it up, tail logs, tear it
# down, reset. Demo/attack targets get added as those pieces land.

.DEFAULT_GOAL := help
.PHONY: help init try up down nuke logs ps dev web restart migrate seed demo curl-suite attack loadtest test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

init: ## Create backend/.env from the example if it doesn't exist
	@test -f backend/.env || cp backend/.env.example backend/.env
	@echo "backend/.env ready"

try: ## ⭐ One command to try it: build, boot, seed, and open the Playground
	docker compose up -d --build
	@echo "Starting Dwarpal — the first run downloads + builds everything, a few minutes is normal..."
	@ok=0; for i in $$(seq 1 90); do curl -sf http://localhost:3000/healthz >/dev/null 2>&1 && { ok=1; break; }; sleep 1; done; \
	if [ $$ok = 1 ]; then \
		echo "✔ Dwarpal is up — opening http://localhost:5173/dashboard/playground"; \
		(open http://localhost:5173/dashboard/playground >/dev/null 2>&1 || xdg-open http://localhost:5173/dashboard/playground >/dev/null 2>&1 || true); \
	else \
		echo "✗ Dwarpal didn't come up in 90s. Is Docker running? Are ports 8080/3000/5173 free? Try: make logs"; \
	fi

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

demo: ## Clean boot + migrate + seed, ready to demo
	docker compose up -d --build
	@echo "waiting for services to come up..."; sleep 8
	docker compose exec proxy node src/db/migrate.js
	docker compose exec proxy node src/scripts/seed.js
	@echo "ready — open http://localhost:5173"

curl-suite: ## Fire one crafted request per attack class (+ a benign 200)
	docker compose run --rm attacker /attacks/curl-suite.sh

attack: ## Hammer the proxy with sqlmap
	docker compose run --rm attacker /attacks/sqlmap.sh

loadtest: ## Load test the proxy with autocannon
	docker compose run --rm attacker /attacks/loadtest.sh

test: ## Run the backend test suite
	cd backend && npm test

logs: ## Tail logs from all services
	docker compose logs -f

ps: ## Show container status
	docker compose ps

dev: ## Run the proxy locally (no containers) against localhost backends
	cd backend && node --watch src/index.js

web: ## Run the dashboard dev server
	cd frontend && npm run dev

restart: ## Restart the proxy to pick up backend code edits (node --watch doesn't cross the bind mount)
	docker compose restart proxy
