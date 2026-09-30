FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --frozen-lockfile
COPY src ./src
COPY db ./db
EXPOSE 3001
CMD ["sh", "-c", "npm run migrate && npm start"]
