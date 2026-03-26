FROM node:18-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --production && apk add --no-cache docker-cli

COPY --from=build /app/dist ./dist
COPY server ./server
COPY server.mjs ./

EXPOSE 4300

CMD ["node", "server.mjs"]
