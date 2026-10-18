FROM node:22-trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts/stockfish-local-server.mjs ./scripts/
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist/start.js"]
