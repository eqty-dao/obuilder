# EQTY oBuilder

Backend service for building Ownables and NFTs on Base blockchain.

oBuilder handles WASM package processing, IPFS storage, NFT minting, and blockchain interactions for EVM native digital assets.

## Features

- EIP-712 Authentication for secure request signing
- Ownable Package Processing with WASM-based smart contracts
- IPFS Integration for decentralized asset storage
- NFT Minting on Base and Arbitrum networks
- Dynamic Pricing from real-time token prices
- Queue Management for tracking processing status

## Tech Stack

- Framework: NestJS
- Blockchain: Base (EVM)
- Storage: S3-compatible (AWS/MinIO), IPFS
- Testing: Vitest
- Linting: Biome

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
pnpm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

- `EQTY_PRIVATE_KEY_MAINNET` / `EQTY_PRIVATE_KEY_TESTNET` - Wallet private keys
- `BUCKET_*` - S3 storage configuration
- `COINMARKETCAP_API_KEY` - For dynamic pricing

See `.env.example` for all configuration options.

### Running

```bash
# Development (hot reload)
pnpm start:dev

# Production build
pnpm build
pnpm start:prod
```

### Testing

```bash
pnpm test
```

## API Documentation

Once running, access Swagger UI at:

- Development: <http://localhost:3001/api>
- Production: <http://localhost:3000/api>

### Main Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/upload | Upload ownable package |
| GET | /api/v1/GetServerInfo | Server status and balances |
| GET | /api/v1/getInQueueEntries | Pending ownables |
| GET | /api/v1/getReadyEntries | Completed ownables |
| GET | /health | Health check |

### Authentication

Protected endpoints require EIP-712 signed requests. The signature includes:

- address: Your wallet address
- timestamp: Request timestamp (within 5 minutes)
- nonce: Unique request identifier

## Architecture

```
src/
├── eqty/           # Base blockchain integration (EqtyService)
├── upload-zip/     # Main controller and service for uploads
├── nft/            # NFT minting logic
├── queue/          # Processing queue management
├── s3/             # Storage service
├── guards/         # EIP-712 authentication guard
└── effects/        # Effect-TS functional pipelines
```

## Migration from LTO

This version has been migrated from LTO Network to Base blockchain:

- All @ltonetwork dependencies removed
- LtoService replaced with EqtyService
- API uses networkType=mainnet|testnet (legacy L/T supported internally)
- Signing changed from LTO HTTP signatures to EIP-712

## License

MIT
