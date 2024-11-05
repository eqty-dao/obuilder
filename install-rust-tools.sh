
#!/bin/bash

echo "Starting installation of specific versions for Rust, rustup, cargo, and wasm-pack..."

# Set environment variables for cargo
export PATH="$HOME/.cargo/bin:$PATH"

# Define desired versions
RUSTUP_VERSION="1.27.1"
CARGO_VERSION="1.79.0"
WASM_PACK_VERSION="0.13.0"

# Install rustup with a specific version if not already installed
if ! command -v rustup &> /dev/null || [[ "$(rustup --version)" != *"$RUSTUP_VERSION"* ]]; then
  echo "Installing rustup version $RUSTUP_VERSION..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  rustup self update --force $RUSTUP_VERSION
else
  echo "rustup version $RUSTUP_VERSION is already installed."
fi

# Set Rust version to install cargo 1.79.0
rustup install "$RUST_VERSION"
rustup default "$RUST_VERSION"
rustup update

# Ensure specific cargo version is set
if [[ "$(cargo --version)" != *"$CARGO_VERSION"* ]]; then
  echo "Updating Cargo to version $CARGO_VERSION..."
  rustup install 1.79.0
fi

# Install a specific version of wasm-pack
if ! command -v wasm-pack &> /dev/null || [[ "$(wasm-pack --version)" != *"$WASM_PACK_VERSION"* ]]; then
  echo "Installing wasm-pack version $WASM_PACK_VERSION..."
  curl -L -o wasm-pack-init.sh https://rustwasm.github.io/wasm-pack/installer/init.sh
  chmod +x wasm-pack-init.sh
  WASM_PACK_VERSION=$WASM_PACK_VERSION ./wasm-pack-init.sh
  rm wasm-pack-init.sh
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
