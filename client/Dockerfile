# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build args become NEXT_PUBLIC env vars at build time
ARG NEXT_PUBLIC_SIGNAL_URL
ARG NEXT_PUBLIC_ICE_POLICY=relay

ENV NEXT_PUBLIC_SIGNAL_URL=$NEXT_PUBLIC_SIGNAL_URL
ENV NEXT_PUBLIC_ICE_POLICY=$NEXT_PUBLIC_ICE_POLICY

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S tincan && adduser -S tincan -G tincan

COPY --from=builder /app/public        ./public
COPY --from=builder /app/.next/static  ./.next/static
COPY --from=builder /app/.next/standalone ./

USER tincan

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health 2>/dev/null || exit 1

CMD ["node", "server.js"]
