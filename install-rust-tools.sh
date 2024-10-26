#!/bin/bash

echo "Starting installation of Rust and wasm-pack..."

# Set environment variables for cargo
export PATH="$HOME/.cargo/bin:$PATH"

# Install Rust
if ! command -v rustup &> /dev/null; then
  echo "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
else
  echo "Rust is already installed."
fi

# Install wasm-pack
if ! command -v wasm-pack &> /dev/null; then
  echo "Installing wasm-pack..."
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
else
  echo "wasm-pack is already installed."
fi

# Set the default Rust toolchain and add the WebAssembly target
rustup default stable && rustup update stable
rustup target add wasm32-unknown-unknown

# Verify installations
echo "Rust version: $(rustc --version)"
echo "Cargo version: $(cargo --version)"
echo "wasm-pack version: $(wasm-pack --version)"
echo "Installation completed successfully."
