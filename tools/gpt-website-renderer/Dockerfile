FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json tsconfig.json ./

RUN npm install
RUN npx playwright install --with-deps chromium

COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 8787

CMD ["node", "dist/server.js"]
