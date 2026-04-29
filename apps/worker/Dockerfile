FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --include=dev

FROM deps AS build
WORKDIR /app
COPY tsconfig.json tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/worker apps/worker
RUN npm run typecheck

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --omit=dev
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
CMD ["npm", "run", "worker:start"]
