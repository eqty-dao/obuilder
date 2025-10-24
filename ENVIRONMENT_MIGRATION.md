# Environment Variables Migration: LTO → Base (EQTY)

## Overview

This document outlines the migration of environment variables from LTO Network conventions to Base blockchain (Ethereum L2) conventions for the EQTY oBuilder system.

## Key Changes

### 1. Network Identifiers

**OLD (LTO):**

- `EQTY_NETWORK_ID=L` (mainnet) / `T` (testnet)
- `QUEUEING_ALLOWED_L` / `QUEUEING_ALLOWED_T`
- `EQTY_TEMPLATE_COSTSUSD_L` / `EQTY_TEMPLATE_COSTSUSD_T`

**NEW (Base):**

- `EQTY_NETWORK_ID=mainnet` / `testnet`
- `QUEUEING_ALLOWED_MAINNET` / `QUEUEING_ALLOWED_TESTNET`
- `EQTY_TEMPLATE_COSTSUSD_MAINNET` / `EQTY_TEMPLATE_COSTSUSD_TESTNET`

### 2. Wallet Configuration

**OLD (LTO):**

- `ACCOUNT_MNEMONIC_L` / `ACCOUNT_MNEMONIC_T`
- `OBRIDGE_WALLET_ADDR_L` / `OBRIDGE_WALLET_ADDR_T`

**NEW (Base):**

- `ACCOUNT_MNEMONIC_MAINNET` / `ACCOUNT_MNEMONIC_TESTNET`
- `OBRIDGE_WALLET_ADDR_MAINNET` / `OBRIDGE_WALLET_ADDR_TESTNET`

### 3. Contract Addresses

**OLD (LTO):**

- `BASE_NFT_CONTRACT_ADDR_L` / `BASE_NFT_CONTRACT_ADDR_T`
- `ETHEREUM_NFT_CONTRACT_ADDR_L` / `ETHEREUM_NFT_CONTRACT_ADDR_T`
- `ARBITRUM_NFT_CONTRACT_ADDR_L` / `ARBITRUM_NFT_CONTRACT_ADDR_T`
- `POLYGON_NFT_CONTRACT_ADDR` / `POLYGON_NFT_CONTRACT_ADDR_T`

**NEW (Base):**

- `BASE_NFT_CONTRACT_ADDR_MAINNET` / `BASE_NFT_CONTRACT_ADDR_TESTNET`
- `ETHEREUM_NFT_CONTRACT_ADDR_MAINNET` / `ETHEREUM_NFT_CONTRACT_ADDR_TESTNET`
- `ARBITRUM_NFT_CONTRACT_ADDR_MAINNET` / `ARBITRUM_NFT_CONTRACT_ADDR_TESTNET`
- `POLYGON_NFT_CONTRACT_ADDR_MAINNET` / `POLYGON_NFT_CONTRACT_ADDR_TESTNET`

### 4. S3 Bucket Configuration

**OLD (LTO):**

- `OWNABLE_BUCKET_QUEUE_L` / `OWNABLE_BUCKET_QUEUE_T`
- `PINATA_BUCKET_L` / `PINATA_BUCKET_T`
- `OWNABLES_BUCKET_L` / `OWNABLES_BUCKET_T`

**NEW (Base):**

- `OWNABLE_BUCKET_QUEUE_MAINNET` / `OWNABLE_BUCKET_QUEUE_TESTNET`
- `PINATA_BUCKET_MAINNET` / `PINATA_BUCKET_TESTNET`
- `OWNABLES_BUCKET_MAINNET` / `OWNABLES_BUCKET_TESTNET`

### 5. Telegram Configuration

**OLD (LTO):**

- `TELEGRAM_CHANNEL_ID_L` / `TELEGRAM_CHANNEL_ID_T`

**NEW (Base):**

- `TELEGRAM_CHANNEL_ID_MAINNET` / `TELEGRAM_CHANNEL_ID_TESTNET`

## Environment Variables Usage

### Core Application

- `NODE_ENV`: Application environment (production, staging, development, test)
- `API_SECRET_KEY`: Secret key for API authentication

### Blockchain Configuration

- `EQTY_NETWORK_ID`: Primary network identifier (mainnet/testnet)
- `BASE_ALCHEMY_API_KEY`: Alchemy API key for Base network RPC calls
- `BASE_NFT_CONTRACT_ADDR_MAINNET/TESTNET`: NFT contract addresses on Base
- `ACCOUNT_MNEMONIC_MAINNET/TESTNET`: Server wallet mnemonic phrases
- `OBRIDGE_WALLET_ADDR_MAINNET/TESTNET`: Server wallet addresses

### Pricing and Costs

- `EQTY_TEMPLATE_COSTSUSD_MAINNET/TESTNET`: Template costs in USD
- `COINMARKETCAP_API_KEY`: API key for ETH/USD price conversion
- `QUEUEING_ALLOWED_MAINNET/TESTNET`: Queue management flags

### External Services

- `RELAY_SERVER`: Relay server URL for message delivery
- `PINATA_JWT`: Pinata IPFS service JWT token
- `PINATA_GATEWAY_URL`: Pinata IPFS gateway URL
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_CHANNEL_ID_MAINNET/TESTNET`: Telegram channel IDs

### Storage Configuration

- `OBUILDER_BUCKET_LOGS`: S3 bucket for logs
- `OWNABLE_BUCKET_QUEUE_MAINNET/TESTNET`: S3 buckets for queue data
- `PINATA_BUCKET_MAINNET/TESTNET`: S3 buckets for Pinata data
- `OWNABLES_BUCKET_MAINNET/TESTNET`: S3 buckets for ownables
- `PACKAGES_PATH`: Local storage path for packages
- `CHAINS_PATH`: Local storage path for chains

### Development

- `LOCAL_TESTING`: Enable local testing mode
- `IPFS_START`: Start IPFS service

## Migration Steps

1. **Update Environment Files**: Replace old LTO-based variable names with new Base-based names
2. **Update Configuration Schema**: Schema has been updated to use new variable names
3. **Update Service Code**: Services need to be updated to use new network identifiers
4. **Deploy Contracts**: Deploy NFT contracts on Base mainnet and testnet
5. **Configure Wallets**: Set up server wallets on Base networks
6. **Test Integration**: Verify all services work with new configuration

## Base Network Details

### Mainnet

- **Chain ID**: 8453
- **RPC URL**: `https://base-mainnet.g.alchemy.com/v2/{API_KEY}`
- **Explorer**: https://basescan.org

### Testnet (Base Sepolia)

- **Chain ID**: 84532
- **RPC URL**: `https://base-sepolia.g.alchemy.com/v2/{API_KEY}`
- **Explorer**: https://sepolia.basescan.org
