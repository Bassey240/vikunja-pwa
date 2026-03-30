FROM node:22-alpine AS build

WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && apk add --no-cache docker-cli docker-cli-compose

COPY --from=build /app/dist ./dist
COPY server ./server
COPY server.mjs ./

EXPOSE 4300

CMD ["node", "server.mjs"]
