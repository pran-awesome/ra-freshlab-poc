# VPS image: builds the web SPA + API bundle, runs on Node.
FROM node:22-alpine AS build
WORKDIR /src
COPY api/package*.json api/
COPY web/package*.json web/
RUN npm ci --prefix api && npm ci --prefix web
COPY api api
COPY web web
RUN npm run build --prefix web && npm run build --prefix api

FROM node:22-alpine
WORKDIR /srv/api
ENV NODE_ENV=production PORT=8787 WEB_DIR=../web/dist DATA_FILE=/data/state.json
COPY api/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /src/api/dist ./dist
COPY --from=build /src/web/dist /srv/web/dist
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/node.js"]
