FROM node:20-alpine
WORKDIR /app
COPY server/package.json ./
RUN npm install --production
COPY server/ ./
COPY maps_extracted.json quests_extracted.json skills_extracted.json drops_extracted.json gear_extracted.json ./
COPY . ../public
EXPOSE 2567
CMD ["node", "server.js"]
