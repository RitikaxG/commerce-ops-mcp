FROM oven/bun:1.3.2 AS build

WORKDIR /app
COPY . .

RUN bun install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun run db:generate
RUN bun run --filter @repo/api build

FROM oven/bun:1.3.2 AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=bun:bun /app /app

USER bun
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e 'const response = await fetch("http://127.0.0.1:3000/health"); if (!response.ok) process.exit(1)'

CMD ["bun", "apps/api/dist/server.js"]
