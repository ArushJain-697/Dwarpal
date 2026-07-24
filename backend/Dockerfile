# Production image for the proxy.
#
# Two stages: install prod-only deps, then copy them plus the source into a
# clean runtime that runs as a non-root user. (There's no build step — the app
# is plain JS — so a separate build stage would be dead weight.)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY migrations ./migrations

# Run as a non-root user so a container-escape via a vulnerable backend can't
# trivially become root inside the container.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 8080 3000
CMD ["node", "src/index.js"]
