FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build arguments for React environment variables.
# Both default to empty: the UI is served same-origin behind nginx,
# which proxies /api, /snapshots, and /videos to the backend.
ARG REACT_APP_API_URL=
ARG REACT_APP_WS_URL=

ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_WS_URL=${REACT_APP_WS_URL}

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
