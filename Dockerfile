FROM node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm install

FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/docker-server.mjs ./scripts/docker-server.mjs
COPY --from=build /app/package*.json ./

EXPOSE 3000

CMD ["node", "scripts/docker-server.mjs"]
