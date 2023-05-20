FROM node:16-alpine

WORKDIR /app

COPY . .

RUN yarn install --frozen-lockfile
RUN yarn build

ENV PORT=9001
EXPOSE 9001

CMD ["yarn", "start"]
