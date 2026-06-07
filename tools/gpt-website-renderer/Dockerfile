FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json tsconfig.json ./

RUN npm install
RUN npx playwright install --with-deps chromium

COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

EXPOSE 8787

CMD ["node", "dist/server.js"]
