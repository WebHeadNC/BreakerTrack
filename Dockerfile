# --- Build stage: install everything and produce the static frontend build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime stage: only what's needed to run the server ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server ./server

# Project files and uploaded images live here — mount a volume so they
# survive container recreation / image updates.
VOLUME ["/app/server/data"]

EXPOSE 3001
CMD ["node_modules/.bin/tsx", "server/index.ts"]
