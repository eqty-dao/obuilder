# Build Stage
FROM node:20 AS build

# Set up environment variables
ENV PATH="/root/.cargo/bin:$PATH"

# Install Rust and wasm-pack
RUN yes "1" | curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Install wasm-pack
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Set default Rust toolchain and add WebAssembly target
RUN rustup default stable \
&& rustup update stable \
&& rustup target add wasm32-unknown-unknown

# Debugging: Verify installation paths
RUN cargo --version
RUN wasm-pack --version
RUN ls -lh /root/.cargo/bin/


# Set working directory and copy necessary files
WORKDIR /usr/src
COPY package*.json ./
RUN npm install

RUN apt-get update && apt-get install -y clang
RUN clang -v
RUN which clang

# Copy the rest of the application code and build
COPY . .
RUN npm run build

# Runtime Stage (node version needs to be the same as build stage)
FROM node:20 AS runtime
# Install necessary tools and dependencies
RUN apt-get update && apt-get install -y clang zip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy installed Rust tools from build stage
COPY --from=build /root/.cargo /root/.cargo
# COPY --from=build /usr/bin/clang /usr/bin/clang

# Set up environment variables
ENV PATH="/root/.cargo/bin:${PATH}"

# ENV NODE_ENV='staging'
# ENV LTO_NODE='https://testnet.lto.network'
# ENV LTO_NETWORK_ID='T'
ENV LTO_ACCOUNT_SEED='test1 test2 test3 test4 test5 test6 test7 test8 test9 test10 test11 test12'

# ENV IPFS_START=false

ENV ACCOUNT_MNEMONIC='sell globe farm embody menu tennis cruise hero crawl universe stock enrich'
ENV ARBITRUM_ALCHEMY_API_KEY='udkYo9BHmW6DqIzQohVDeDDsHjf_97pg'
ENV ETH_ALCHEMY_API_KEY='m7wpMjKVPvrU_NMGEwEntAzGtk6ygVDF'
ENV ETHEREUM_NFT_CONTRACT_ADDR='0x56213ECA28860d8fb5DAF6A8dCdA7bB28d7c360F'
ENV ARBITRUM_NFT_CONTRACT_ADDR='0x1527f2f8Cd41b000e1E8F70906012bEFab993AD9'
ENV POLYGON_NFT_CONTRACT_ADDR=''

RUN which clang
RUN clang -v


# Set Rustup default toolchain in runtime
RUN /root/.cargo/bin/rustup default stable
RUN /root/.cargo/bin/rustup update stable
RUN /root/.cargo/bin/rustup target add wasm32-unknown-unknown

# Verify the Rust toolchain in runtime
# RUN which cargo
# RUN cargo --version
# RUN wasm-pack --version
# RUN ls -lh /root/.cargo/bin/
# RUN ls -lh /root/.cargo/env
# RUN file /root/.cargo/bin/cargo
# RUN ldd /root/.cargo/bin/cargo
# RUN sh -c '. /root/.cargo/env && cargo --version'
# RUN sh -c '. /root/.cargo/env && rustup --version'

# Copy application files
COPY --from=build /usr/src/dist ./dist
COPY --from=build /usr/src/node_modules ./node_modules
COPY --from=build /usr/src/package*.json ./
COPY --from=build /usr/src/ownables ./ownables
COPY --from=build /usr/src/storage ./storage

# Expose port and define command to run the application
EXPOSE 3000
CMD ["node", "dist/main.js"]
