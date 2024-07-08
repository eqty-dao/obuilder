FROM node:20 AS build
WORKDIR /usr/src

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./
RUN npm install

# Copy the rest of the application code n build
COPY . .
RUN npm run build

# Run it
FROM node:20-alpine AS runtime
WORKDIR /usr/src

# Copy necessary files from the build stage
COPY --from=build /usr/src/dist ./dist
COPY --from=build /usr/src/node_modules ./node_modules
COPY --from=build /usr/src/package*.json ./
COPY --from=build /usr/src/ownables ./ownables
COPY --from=build /usr/src/storage ./storage

EXPOSE 3000
CMD ["node", "dist/main.js"]
