# Node image for the P2 two-node federation harness.
#
# NFR-F05: the node must run on a Raspberry Pi 4 in under 512 MB RAM. That is a design
# constraint, not a target, so this image installs production dependencies only and ships
# compiled output rather than sources plus a toolchain.

FROM node:20-alpine AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Manifests first, so a dependency install layer is reused when only sources change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages/sdk-ts/package.json packages/sdk-ts/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile

COPY proto/ proto/
COPY tools/ tools/
COPY packages/sdk-ts/ packages/sdk-ts/
COPY backend/ backend/
RUN pnpm --filter @jagoo/sdk build && pnpm --filter @jagoo/backend build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY --from=build /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/.npmrc ./
COPY --from=build /repo/packages/sdk-ts/package.json packages/sdk-ts/
COPY --from=build /repo/backend/package.json backend/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/packages/sdk-ts/dist packages/sdk-ts/dist
COPY --from=build /repo/backend/dist backend/dist

# Never run as root: a node operator under a shutdown is often running this on hardware
# they cannot easily reimage.
USER node

EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
