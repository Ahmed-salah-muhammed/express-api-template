# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- dependencies
# Debian rather than Alpine: a native module (better-sqlite3) ships ready-made binaries
# for it, where Alpine can end up compiling one from source.
FROM node:24-slim AS deps
WORKDIR /app

# The manifests alone first, so the install layer is cached and only re-runs when a
# dependency actually changes - not on every source edit. `npm ci` installs exactly what
# the lockfile pins, without the tools only tests and linting need.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --------------------------------------------------------------- runtime
FROM node:24-slim AS runtime
WORKDIR /app

# Plain HTTP on a fixed port: a reverse proxy terminates TLS and forwards here.
ENV NODE_ENV=production \
    PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The two directories the app writes to, and so the only things the non-root user owns
# (`node` ships with the image). Both are mounted volumes in Compose; created here so a
# container run without them still starts.
#   uploads  uploaded files, served back at /uploads
#   data     the database file, when DB_CLIENT is sqlite
RUN mkdir -p /app/uploads /app/data \
 && chown -R node:node /app/uploads /app/data

USER node
EXPOSE 8080

# With node itself: the slim image has neither curl nor wget. 127.0.0.1, not localhost,
# which can resolve to ::1 first while the app listens on IPv4.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
