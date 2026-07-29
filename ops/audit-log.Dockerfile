FROM node:20-alpine AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages/sdk-ts/package.json packages/sdk-ts/
COPY services/audit-log/package.json services/audit-log/
RUN pnpm install --frozen-lockfile

COPY proto/ proto/
COPY tools/ tools/
COPY packages/sdk-ts/ packages/sdk-ts/
COPY services/audit-log/ services/audit-log/
RUN pnpm --filter @jagoo/sdk build && pnpm --filter @jagoo/audit-log build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY --from=build /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/.npmrc ./
COPY --from=build /repo/packages/sdk-ts/package.json packages/sdk-ts/
COPY --from=build /repo/services/audit-log/package.json services/audit-log/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/packages/sdk-ts/dist packages/sdk-ts/dist
COPY --from=build /repo/services/audit-log/dist services/audit-log/dist

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3100
CMD ["node", "services/audit-log/dist/main.js"]
