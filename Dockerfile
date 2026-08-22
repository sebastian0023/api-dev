# Dev-mode image: installs deps + generates the Prisma client at build
# time; docker-compose bind-mounts src/prisma/scripts over this for live
# reload, and runs `prisma migrate deploy` before `npm run dev` at
# container start. Not a production build — this whole app is throwaway.
FROM node:22-bookworm
WORKDIR /app

# Playwright's Chromium build requires glibc-based Linux plus its runtime
# libraries; Alpine/musl is not a supported browser target.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
RUN npx playwright install --with-deps chromium && chown -R node:node /ms-playwright

COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
# prisma.config.ts unconditionally resolves DATABASE_URL at config-load
# time, even for `generate` (which doesn't connect to anything) — this
# placeholder is only for that resolution; the real value comes from
# docker-compose's `environment:` at container start.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

USER node

EXPOSE 3000
CMD ["npm", "run", "dev"]
