FROM node:22-alpine AS build

WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Keeps the deploy-time stamp if present (no git in the build context),
# else writes one so the COPY below never fails.
RUN node scripts/generate-build-info.mjs
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && apk add --no-cache docker-cli docker-cli-compose

COPY --from=build /app/dist ./dist
COPY --from=build /app/build-info.json ./build-info.json
COPY server ./server
COPY server.mjs ./

EXPOSE 4300

CMD ["node", "server.mjs"]
