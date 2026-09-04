# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs .npmrc ./
COPY applications/dashboard/package.json applications/dashboard/package.json
COPY platform/gateway/package.json platform/gateway/package.json
COPY platform/identity/package.json platform/identity/package.json
COPY platform/workspace/package.json platform/workspace/package.json
COPY services/ai/package.json services/ai/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY applications ./applications
COPY platform ./platform
COPY services ./services
COPY packages ./packages

RUN pnpm build

FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /workspace
COPY --from=builder --chown=node:node /workspace /workspace

USER node
CMD ["node", "platform/gateway/dist/src/main.js"]
