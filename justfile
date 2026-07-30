[unix]
set shell := ["bash", "-cu"]

[windows]
set shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

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
[unix]
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

[windows]
dev: ops-up
    @New-Item -ItemType Directory -Force .run | Out-Null
    @if ((Test-Path .run/backend.pid) -and (Get-Process -Id (Get-Content .run/backend.pid) -ErrorAction SilentlyContinue)) { Write-Host "Backend is already running (PID: $(Get-Content .run/backend.pid)). Skipping start." } else { Write-Host "Starting backend in background..."; $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/s', '/c', 'pnpm --filter @jagoo/backend dev > .run/backend.log 2>&1' -PassThru -WindowStyle Hidden; Set-Content -Path .run/backend.pid -Value $process.Id; Write-Host "Backend started. Use 'just logs' for backend output, and 'just kill' to stop." }
    @Write-Host "Starting frontend interactively..."
    @pnpm --filter @jagoo/frontend dev

# View background logs
[unix]
logs:
    tail -f .run/backend.log

[windows]
logs:
    Get-Content -Path .run/backend.log -Wait

# View background processes status
[unix]
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

[windows]
ps:
    @Write-Host "SERVICE    PID      PORTS      STATUS"
    @Write-Host "----------------------------------------"
    @if (Test-Path .run/backend.pid) { $pid = Get-Content .run/backend.pid; if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { $ports = (Get-NetTCPConnection -OwningProcess $pid -State Listen -ErrorAction SilentlyContinue | ForEach-Object LocalPort | Sort-Object -Unique) -join ','; if (-not $ports) { $ports = '-' }; '{0,-10} {1,-8} {2,-10} {3}' -f 'backend', $pid, $ports, 'RUNNING' } else { '{0,-10} {1,-8} {2,-10} {3}' -f 'backend', $pid, '-', 'DEAD' } } else { '{0,-10} {1,-8} {2,-10} {3}' -f 'backend', '-', '-', 'STOPPED' }
    @Write-Host ''
    @Write-Host 'INFRASTRUCTURE (Docker)'
    @Write-Host '--------------------------------'
    @docker compose -f ops/docker-compose.yml ps --format "table {{ "{{" }}.Name}}\t{{ "{{" }}.Service}}\t{{ "{{" }}.Ports}}\t{{ "{{" }}.Status}}"

# Kill background processes and stop infrastructure
[unix]
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

[windows]
kill:
    @if (Test-Path .run/backend.pid) { $pid = Get-Content .run/backend.pid; Write-Host "Stopping backend (PID: $pid)..."; taskkill /PID $pid /T /F 2>$null | Out-Null; Remove-Item -Force .run/backend.pid }
    @Write-Host 'Stopping infrastructure...'
    @docker compose -f ops/docker-compose.yml down
    @Write-Host 'All services stopped.'

# Clean up all build artifacts and node_modules
[unix]
clean:
    pnpm run clean
    cargo clean -p jb-core || true

[windows]
clean:
    pnpm run clean
    @cargo clean -p jb-core; if ($LASTEXITCODE -ne 0) { Write-Warning 'Cargo cleanup failed; continuing.' }

# Hard reset: wipe docker volumes, clean all artifacts, and reinstall from scratch
reset: ops-down-v clean install

# Seed the database with initial mock data
[unix]
seed:
    pnpm --filter @jagoo/backend exec tsx src/cli/seed.ts || echo "Note: No seed.ts script found yet, ready for implementation"

[windows]
seed:
    @pnpm --filter @jagoo/backend exec tsx src/cli/seed.ts; if ($LASTEXITCODE -ne 0) { Write-Host 'Note: No seed.ts script found yet, ready for implementation' }

# Run all primary CI checks across the monorepo
check: lint typecheck test proto-check vectors

# Build and install the custom Android development client (required for native modules).
# React Native 0.76 pins NDK 26.1.10909125. A partial SDK download can leave the directory
# present without source.properties; repair that package before Gradle evaluates the project.
# Build/install Android and repair the pinned NDK automatically when needed.
[windows]
android:
    @$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }; $sdkManager = Join-Path $androidSdk 'cmdline-tools\latest\bin\sdkmanager.bat'; $ndkMarker = Join-Path $androidSdk 'ndk\26.1.10909125\source.properties'; if (-not (Test-Path -LiteralPath $sdkManager)) { throw "Android sdkmanager was not found at $sdkManager. Install Android command-line tools or set ANDROID_HOME." }; if (-not (Test-Path -LiteralPath $ndkMarker)) { Write-Host 'Repairing incomplete Android NDK 26.1.10909125...'; & $sdkManager --uninstall 'ndk;26.1.10909125' 2>$null; & $sdkManager --install 'platform-tools' 'ndk;26.1.10909125'; if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ndkMarker)) { throw 'Android NDK repair did not complete.' } }; Write-Host "Android SDK ready: $androidSdk"
    pnpm --filter @jagoo/frontend exec expo run:android

[linux]
android:
    @android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"; sdkmanager="$android_sdk/cmdline-tools/latest/bin/sdkmanager"; marker="$android_sdk/ndk/26.1.10909125/source.properties"; if [ ! -x "$sdkmanager" ]; then echo "Android sdkmanager was not found at $sdkmanager. Install Android command-line tools or set ANDROID_HOME." >&2; exit 1; fi; if [ ! -f "$marker" ]; then echo "Repairing incomplete Android NDK 26.1.10909125..."; "$sdkmanager" --uninstall "ndk;26.1.10909125" >/dev/null 2>&1 || true; "$sdkmanager" --install "platform-tools" "ndk;26.1.10909125"; test -f "$marker"; fi; echo "Android SDK ready: $android_sdk"
    pnpm --filter @jagoo/frontend exec expo run:android

[macos]
android:
    @android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"; sdkmanager="$android_sdk/cmdline-tools/latest/bin/sdkmanager"; marker="$android_sdk/ndk/26.1.10909125/source.properties"; if [ ! -x "$sdkmanager" ]; then echo "Android sdkmanager was not found at $sdkmanager. Install Android command-line tools or set ANDROID_HOME." >&2; exit 1; fi; if [ ! -f "$marker" ]; then echo "Repairing incomplete Android NDK 26.1.10909125..."; "$sdkmanager" --uninstall "ndk;26.1.10909125" >/dev/null 2>&1 || true; "$sdkmanager" --install "platform-tools" "ndk;26.1.10909125"; test -f "$marker"; fi; echo "Android SDK ready: $android_sdk"
    pnpm --filter @jagoo/frontend exec expo run:android

# Native iOS builds are a macOS/Xcode capability. Other platforms keep a discoverable,
# successful recipe that explains the constraint rather than failing with "pod: command not found".
[macos]
ios:
    pnpm --filter @jagoo/frontend exec expo run:ios

[linux]
ios:
    @echo "iOS native builds require macOS with Xcode. Use 'pnpm --filter @jagoo/frontend start' to work with an already-built iOS development client."

[windows]
ios:
    @Write-Host "iOS native builds require macOS with Xcode. Use 'pnpm --filter @jagoo/frontend start' to work with an already-built iOS development client."

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

publish remote_port="12001":
    bore local 3000 --to bore.pub -p {{remote_port}}

# Tunnel the node AND its auxiliary services, each on the same remote port as its local one.
#
# Publishing only :3000 is what made the app look broken over a tunnel: the node was reachable,
# so discovery succeeded, but every address it advertised for the audit log, mCaptcha and the
# blob store pointed at 127.0.0.1 — which, evaluated on a phone, is the phone. Keeping remote
# and local ports equal is what lets ops/service-map.json stay a fixed file.
#
# Requires ops/service-map.json (copy ops/service-map.json.example) and, for uploads to work,
# S3_PUBLIC_ENDPOINT=http://bore.pub:9000 in backend/.env — a presigned URL is only valid for
# the host it was signed for, so advertising the address is necessary but not sufficient.
[unix]
publish-all:
    @echo "node :3000  audit :3100  mcaptcha :7000  blob :9000  -> bore.pub"
    @for p in 3000 3100 7000 9000; do bore local $p --to bore.pub -p $p & done; wait

[windows]
publish-all:
    @Write-Host "node :3000  audit :3100  mcaptcha :7000  blob :9000  -> bore.pub"
    @$jobs = @(3000, 3100, 7000, 9000) | ForEach-Object { Start-Process -FilePath 'bore' -ArgumentList 'local', $_, '--to', 'bore.pub', '-p', $_ -PassThru -NoNewWindow }; Write-Host "Started $($jobs.Count) tunnels. Ctrl+C or 'just publish-stop' to end."; Wait-Process -Id $jobs.Id

[windows]
publish-stop:
    @Get-Process bore -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Host "tunnels stopped"

[unix]
publish-stop:
    @pkill -f "bore local" || true; echo "tunnels stopped"