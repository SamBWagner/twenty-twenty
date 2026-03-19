# Stage 1: Install all deps and build both packages
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci

COPY . .

RUN cd packages/api && npm run build
RUN cd packages/web && npm run build

# Stage 2: Production dependencies only (includes native better-sqlite3)
FROM node:20-slim AS production-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --omit=dev

# Stage 3: Minimal runtime image
FROM node:20-slim AS runtime

WORKDIR /app

# Install Caddy for reverse proxy
RUN apt-get update && apt-get install -y --no-install-recommends \
    caddy && \
    rm -rf /var/lib/apt/lists/*

# Copy production node_modules (with native better-sqlite3 addon)
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/packages/api/node_modules ./packages/api/node_modules

# Copy built API
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/drizzle ./packages/api/drizzle
COPY --from=builder /app/packages/api/package.json ./packages/api/

# Copy built Web
COPY --from=builder /app/packages/web/dist ./packages/web/dist
COPY --from=builder /app/packages/web/package.json ./packages/web/

# Copy shared package (type-only at runtime, but needed for module resolution)
COPY --from=builder /app/packages/shared ./packages/shared

# Copy root package.json (needed for workspace resolution)
COPY --from=builder /app/package.json ./

# Copy Caddyfile and entrypoint
COPY Caddyfile /etc/caddy/Caddyfile
COPY scripts/prod-entrypoint.sh /usr/local/bin/prod-entrypoint.sh
RUN chmod +x /usr/local/bin/prod-entrypoint.sh

# Create data directory for SQLite volume mount
RUN mkdir -p /data

ENV DATABASE_PATH=/data/twenty-twenty.db

EXPOSE 8080

ENTRYPOINT ["prod-entrypoint.sh"]
