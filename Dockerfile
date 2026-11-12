# Tab Creator is a static site, so the image is just nginx plus the files in public/.
# nginx:stable-alpine is published for amd64, arm64 and arm/v7, so this builds on a Raspberry Pi as is.
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
