FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json tsconfig.json ./

RUN npm install
RUN npx playwright install --with-deps chromium

COPY src ./src

RUN node -e "const fs=require('fs'); const p='src/server.ts'; let s=fs.readFileSync(p,'utf8'); s=s.replace('const header = request.headers[\"x-api-key\"];\n  const suppliedKey = Array.isArray(header) ? header[0] : header;','const header = request.headers[\"x-api-key\"] ?? request.headers[\"authorization\"];\n  const rawSuppliedKey = Array.isArray(header) ? header[0] : header;\n  const suppliedKey = rawSuppliedKey?.replace(/^Bearer\\s+/i, \"\").trim();'); fs.writeFileSync(p,s);"

RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 8787

CMD ["node", "dist/server.js"]
