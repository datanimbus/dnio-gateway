FROM node:18-alpine

RUN apk update
RUN apk upgrade
RUN set -ex; apk add --no-cache --virtual .fetch-deps curl tar git ;

WORKDIR /tmp/app

COPY package.json package.json

RUN npm install -g npm
RUN npm install --production
RUN npm audit fix --production

# RUN npm install --production --no-audit

RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/test

RUN mkdir uploads

COPY . .

ENV IMAGE_TAG=__image_tag__

EXPOSE 9080

RUN chmod -R 777 /tmp/app

CMD node app.js