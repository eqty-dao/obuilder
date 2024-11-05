
#!/bin/bash

echo "Starting installation of specific versions for Rust, rustup, cargo, and wasm-pack..."

# Set environment variables for cargo
export PATH="$HOME/.cargo/bin:$PATH"

# Define desired versions
RUST_VERSION="1.63.0"          # Set Rust version to get Cargo 1.79.0
WASM_PACK_VERSION="0.12.1"     # Set wasm-pack version

# Install rustup (latest version, since specific versions aren't directly supported)
if ! command -v rustup &> /dev/null; then
  echo "Installing rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
else
  echo "rustup is already installed."
fi

# Install the specific Rust and Cargo version
rustup install "$RUST_VERSION"
rustup default "$RUST_VERSION"

# Verify Cargo version
CARGO_VERSION_INSTALLED=$(cargo --version)
if [[ "$CARGO_VERSION_INSTALLED" != *"1.79.0"* ]]; then
  echo "Cargo version mismatch. Expected 1.79.0 but got $CARGO_VERSION_INSTALLED."
fi

# Install a specific version of wasm-pack
if ! command -v wasm-pack &> /dev/null || [[ "$(wasm-pack --version)" != *"$WASM_PACK_VERSION"* ]]; then
  echo "Installing wasm-pack version $WASM_PACK_VERSION..."
  curl -L -o wasm-pack.tar.gz "https://github.com/rustwasm/wasm-pack/releases/download/v$WASM_PACK_VERSION/wasm-pack-v$WASM_PACK_VERSION-x86_64-unknown-linux-musl.tar.gz"
  tar -xzf wasm-pack.tar.gz -C "$HOME/.cargo/bin/" wasm-pack
  rm wasm-pack.tar.gz
else
  echo "wasm-pack version $WASM_PACK_VERSION is already installed."
fi

# Add the WebAssembly target
rustup target add wasm32-unknown-unknown

# Verify installations
echo "rustup version: $(rustup --version)"
echo "Cargo version: $(cargo --version)"
echo "wasm-pack version: $(wasm-pack --version)"
echo "Installation of specific versions completed successfully."