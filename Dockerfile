# ─────────────────────────────────────────────────────────
# Stage 1 (optional): Build application
#   Skipped in CI — dist/ is pre-built by GitHub Actions job
#   and injected via build-arg SKIP_BUILD=true
# ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG SKIP_BUILD=false

COPY package*.json ./
RUN if [ "$SKIP_BUILD" = "false" ]; then npm ci --legacy-peer-deps; fi

COPY . .

RUN if [ "$SKIP_BUILD" = "false" ]; then npm run build; fi

# ─────────────────────────────────────────────────────────
# Stage 2: Production Web Server (Nginx)
# ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

LABEL org.opencontainers.image.title="PYIDCC Line-2 Crew Control"
LABEL org.opencontainers.image.description="BMRCL Peenya Industry Depot Crew Control System"
LABEL org.opencontainers.image.source="https://github.com/nageshn444-cmd/pyidcc-line-2"

# Nginx SPA config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
