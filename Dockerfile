# Build Stage
FROM node:20 AS build

# Set up environment variables
ENV PATH="/root/.cargo/bin:$PATH"

# Install Rust and wasm-pack
RUN yes "1" | curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Copy and run the installation script for Rust and wasm-pack
# COPY install-rust-tools.sh /usr/local/bin/
# RUN chmod +x /usr/local/bin/install-rust-tools.sh
# RUN /usr/local/bin/install-rust-tools.sh

# Set the default Rust toolchain to stable explicitly
# RUN /root/.cargo/bin/rustup default stable

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
