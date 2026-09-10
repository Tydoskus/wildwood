# Build from the repository root:
# docker build -f services/gem-verifier/Dockerfile -t wildstat-gem-verifier .
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY shared/gem-packs.ts shared/gem-packs.ts
COPY services/gem-verifier/*.ts services/gem-verifier/
RUN ./node_modules/.bin/esbuild services/gem-verifier/server.ts --bundle --platform=node --target=node22 --outfile=/build/verifier.cjs

FROM node:22-alpine
WORKDIR /app
COPY --from=build /build/verifier.cjs ./verifier.cjs
USER node
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "verifier.cjs"]
