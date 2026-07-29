set shell := ["bash", "-c"]

default:
    @just --list

alias i := install
alias b := build
alias c := clean
alias d := dev

# ==========================================
# 🚀 Everyday Workflow (Simplified)
# ==========================================

# First-time setup (Installs node, rust, python, and ops)
setup: install proto-gen build

# Start the full local dev environment (Databases + Backend in background, Frontend interactive)
dev: ops-up
    @mkdir -p .run
    @if [ -f .run/backend.pid ] && ps -p $(cat .run/backend.pid) > /dev/null 2>&1; then \
        echo "Backend is already running (PID: $(cat .run/backend.pid)). Skipping start."; \
    else \
        echo "Starting backend in background..."; \
        pnpm --filter @jagoo/backend dev > .run/backend.log 2>&1 & echo $! > .run/backend.pid; \
        echo "Backend started. Use 'just logs' for backend output, and 'just kill' to stop."; \
    fi
    @echo "Starting frontend interactively..."
    @pnpm --filter @jagoo/frontend dev

# View background logs
logs:
    tail -f .run/backend.log

# View background processes status
ps:
    @echo "SERVICE    PID      PORTS      STATUS"
    @echo "----------------------------------------"
    @for svc in backend; do \
        if [ -f .run/$svc.pid ]; then \
            pid=$(cat .run/$svc.pid); \
            if ps -p $pid > /dev/null 2>&1; then \
                pids=$(pstree -p $pid 2>/dev/null | grep -oP '\(\K\d+(?=\))' || echo $pid); \
                ports=$(ss -lptn 2>/dev/null | grep -F "$(echo "$pids" | sed 's/^/pid=/')" | awk '{print $4}' | awk -F: '{print $NF}' | sort -u | tr '\n' ',' | sed 's/,$//'); \
                if [ -z "$ports" ]; then ports="-"; fi; \
                printf "%-10s %-8s %-10s %s\n" $svc $pid "$ports" "RUNNING"; \
            else \
                printf "%-10s %-8s %-10s %s\n" $svc $pid "-" "DEAD"; \
            fi; \
        else \
            printf "%-10s %-8s %-10s %s\n" $svc "-" "-" "STOPPED"; \
        fi; \
    done
    @echo ""
    @echo "INFRASTRUCTURE (Docker)"
    @echo "--------------------------------"
    @docker compose -f ops/docker-compose.yml ps --format "table {{ "{{" }}.Name}}\t{{ "{{" }}.Service}}\t{{ "{{" }}.Ports}}\t{{ "{{" }}.Status}}"

# Kill background processes and stop infrastructure
kill:
    @for svc in backend; do \
        if [ -f .run/$svc.pid ]; then \
            pid=$(cat .run/$svc.pid); \
            echo "Stopping $svc (PID: $pid)..."; \
            pkill -P $pid 2>/dev/null || true; \
            kill $pid 2>/dev/null || true; \
            rm -f .run/$svc.pid; \
        fi; \
    done
    @echo "Stopping infrastructure..."
    @docker compose -f ops/docker-compose.yml down
    @echo "All services stopped."

# Clean up all build artifacts and node_modules
clean:
    pnpm run clean
    cargo clean -p jb-core || true

# Hard reset: wipe docker volumes, clean all artifacts, and reinstall from scratch
reset: ops-down-v clean install

# Seed the database with initial mock data
seed:
    pnpm --filter @jagoo/backend exec tsx src/cli/seed.ts || echo "Note: No seed.ts script found yet, ready for implementation"

# Run all primary CI checks across the monorepo
check: lint typecheck test proto-check vectors

# Build and install the custom Android development client (required for native modules)
android:
    pnpm --filter @jagoo/frontend exec expo run:android

# Build and install the custom iOS development client (required for native modules)
ios:
    pnpm --filter @jagoo/frontend exec expo run:ios

# ==========================================
# 📦 Installation
# ==========================================

install: install-workspace install-rust install-python ops-install

install-workspace:
    pnpm install --frozen-lockfile

install-rust:
    cargo fetch

install-python:
    pip install pytest

# ==========================================
# 🐳 Ops & Infrastructure
# ==========================================

# Pull Docker images
ops-install:
    docker compose -f ops/docker-compose.yml pull

# Start MongoDB, Redis, and MinIO
ops-up:
    pnpm run ops:up

# Stop all docker services
ops-down:
    pnpm run ops:down

# Stop services and wipe volumes (destructive!)
ops-down-v:
    docker compose -f ops/docker-compose.yml down -v

# Show docker compose logs
ops-logs:
    pnpm run ops:logs

# Start two-node federation network
ops-two-node:
    pnpm run ops:two-node

# ==========================================
# 🔨 Building & Testing (Monorepo wide)
# ==========================================

build:
    pnpm run build

lint:
    pnpm run lint

typecheck:
    pnpm run typecheck

test:
    pnpm run test

# ==========================================
# 🔌 Component specific targets (for fine-grained control)
# ==========================================

backend-dev:
    pnpm --filter @jagoo/backend dev

frontend-dev:
    pnpm --filter @jagoo/frontend dev

backend-secrets:
    pnpm --filter @jagoo/backend secrets:generate

backend-rebuild:
    pnpm --filter @jagoo/backend rebuild-projections

# ==========================================
# 🧬 Protobufs & Cross-Language Vectors
# ==========================================

proto-lint:
    pnpm run proto:lint

proto-gen:
    pnpm run proto:gen

proto-check:
    pnpm run proto:check

vectors:
    pnpm run vectors

vectors-ts:
    pnpm run vectors:ts

vectors-rust:
    pnpm run vectors:rust

vectors-python:
    pnpm run vectors:python
