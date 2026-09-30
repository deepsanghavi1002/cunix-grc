FROM node:22-bookworm-slim AS web-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS api-deps
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/db ./db
COPY --from=web-build /build/frontend/dist ./public
USER node
EXPOSE 3001
CMD ["sh", "-c", "npm run migrate && npm start"]
