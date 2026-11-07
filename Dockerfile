FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# 数据持久化目录,部署时建议挂载为卷(见 README)
VOLUME ["/app/data"]

ENV PORT=3000
ENV NOTE_BIND_HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
