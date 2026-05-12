set-working-directory := "."

# Install dependencies for both backend and frontend
install:
    cd backend && pnpm install
    cd frontend && pnpm install

# Start required database services via Docker
services-up:
    docker compose up -d mongo redis

# Stop database services
services-down:
    docker compose down

# Run the backend locally
backend-dev:
    cd backend && pnpm start:dev

# Run the frontend locally
frontend-dev:
    cd frontend && pnpm exec next dev --turbopack -p 6001

# Run both components currently in development
dev: services-up
    pnpm dlx concurrently "cd backend && pnpm start:dev" "cd frontend && pnpm exec next dev --turbopack -p 6001"

# Run backend + frontend together in one command without concurrently
dev-all: services-up
    bash -c 'set -e; (cd backend && pnpm start:dev) & BACKEND_PID=$!; (cd frontend && pnpm exec next dev --turbopack -p 6001) & FRONTEND_PID=$!; trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" INT TERM EXIT; wait'

# Run backend end-to-end tests
test-e2e: services-up
    cd backend && pnpm test:e2e

# Build production artifacts
build:
    cd backend && pnpm build
    cd frontend && pnpm build
