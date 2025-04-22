# oBuilder - Building Ownables and NFTs Made Easy

oBuilder is a powerful platform for creating and managing Ownables and NFTs. Built with NestJS, it provides a robust backend infrastructure for handling digital assets, blockchain interactions, and IPFS storage.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v16 or higher)
- npm or yarn
- Rust (for Ownables development)
- Docker (optional, for containerized deployment)
- MySQL (or compatible database)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/oBuilder.git
cd oBuilder
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with the following variables:
```
# Database Configuration
DATABASE_URL="mysql://user:password@localhost:3306/obuilder"

# AWS S3 Configuration (if using S3 storage)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_BUCKET_NAME=your_bucket_name

# IPFS Configuration
IPFS_API_URL=your_ipfs_api_url
IPFS_GATEWAY_URL=your_ipfs_gateway_url

# LTO Network Configuration
LTO_NETWORK_API_URL=your_lto_api_url
LTO_NETWORK_API_KEY=your_lto_api_key
```

4. Install Rust tools (for Ownables development):
```bash
npm run rustup
```

## Project Structure

```
src/
├── common/           # Common utilities and shared code
├── config/           # Configuration files
├── ethers/           # Ethereum blockchain interactions
├── interfaces/       # TypeScript interfaces
├── ipfs/             # IPFS storage integration
├── lto/              # LTO Network integration
├── nft/              # NFT-related functionality
├── ownables/         # Ownables implementation
├── queue/            # Queue management
├── s3/               # S3 storage integration
├── services/         # Core services
├── telegram-bot/     # Telegram bot integration
├── upload-zip/       # ZIP file handling
└── utils/            # Utility functions
```

## Development

### Running the App

```bash
# Development mode
npm run start:dev

# Debug mode
npm run start:debug

# Production mode
npm run start:prod
```

### Building Ownables

To build an Ownable package:
```bash
npm run ownables:build --package=your-package-name
```

### Code Style

The project uses Prettier and ESLint for code formatting:
```bash
# Format code
npm run format

# Lint code
npm run lint
```

## Testing

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Deployment

### Docker Deployment

1. Build the Docker image:
```bash
docker build -t obuilder .
```

2. Run using Docker Compose:
```bash
docker-compose up -d
```

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Start the production server:
```bash
npm run start:prod
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

## Stay in touch

- Website - [LTO Network](https://ltonetwork.com)
- Twitter - [@LTONetwork](https://twitter.com/LTONetwork)
