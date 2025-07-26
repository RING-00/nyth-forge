FROM oven/bun AS build

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock

RUN bun install

COPY ./src ./src
COPY ./public ./public
COPY tsconfig.json tsconfig.json
COPY bunfig.toml bunfig.toml

ENV NODE_ENV=development

RUN bun build \
  --compile \
  --minify-whitespace \
  --minify-syntax \
  --target bun \
  --outfile server \
  ./src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server
COPY --from=build /app/public public

ENV NODE_ENV=development

CMD ["./server"]

EXPOSE 3000
