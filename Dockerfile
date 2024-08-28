FROM node:20-alpine as build
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json ./
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

ARG PWA_ENABLED="true"
ARG GA_ID
ARG APP_DOMAIN
ARG OPENSEARCH_ENABLED="false"
ARG TMDB_READ_API_KEY="eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmYWNkMmE1YWE0YmMwMzAyZjNhZmRlYTIwZGQ2YWRhZSIsInN1YiI6IjY1OTEyNjU1NjUxZmNmNWYxMzhlMWRjNyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.5boG-w-nlk-SWB8hvFeWq_DNRbrU6n5XEXleVQ1L1Sg"
ARG CORS_PROXY_URL
ARG DMCA_EMAIL
ARG NORMAL_ROUTER="false"
ARG BACKEND_URL
ARG HAS_ONBOARDING="false"
ARG ONBOARDING_CHROME_EXTENSION_INSTALL_LINK
ARG ONBOARDING_PROXY_INSTALL_LINK
ARG DISALLOWED_IDS
ARG CDN_REPLACEMENTS
ARG TURNSTILE_KEY
ARG ALLOW_AUTOPLAY="false"
ARG VITE_VIDSRC_HOME="https://vidsrc.cc"
ARG VITE_VIDSRC_SERVICE_URL="https://vidsrc.cc/api"

ENV VITE_PWA_ENABLED=${PWA_ENABLED}
ENV VITE_GA_ID=${GA_ID}
ENV VITE_APP_DOMAIN=${APP_DOMAIN}
ENV VITE_OPENSEARCH_ENABLED=${OPENSEARCH_ENABLED}
ENV VITE_TMDB_READ_API_KEY=${TMDB_READ_API_KEY}
ENV VITE_CORS_PROXY_URL=${CORS_PROXY_URL}
ENV VITE_DMCA_EMAIL=${DMCA_EMAIL}
ENV VITE_NORMAL_ROUTER=${NORMAL_ROUTER}
ENV VITE_BACKEND_URL=${BACKEND_URL}
ENV VITE_HAS_ONBOARDING=${HAS_ONBOARDING}
ENV VITE_ONBOARDING_CHROME_EXTENSION_INSTALL_LINK=${ONBOARDING_CHROME_EXTENSION_INSTALL_LINK}
ENV VITE_ONBOARDING_PROXY_INSTALL_LINK=${ONBOARDING_PROXY_INSTALL_LINK}
ENV VITE_DISALLOWED_IDS=${DISALLOWED_IDS}
ENV VITE_CDN_REPLACEMENTS=${CDN_REPLACEMENTS}
ENV VITE_TURNSTILE_KEY=${TURNSTILE_KEY}
ENV VITE_ALLOW_AUTOPLAY=${ALLOW_AUTOPLAY}

COPY . ./
RUN pnpm run build

# production environment
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
