# oBuilder API Endpoints Documentation

**Base URL:** `/api/v1`

## Core Endpoints

### Health & Server Info

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check for container orchestration |
| `GET` | `/info` | App info |
| `GET` | `/api/v1/GetServerInfo` | Server balances and wallet addresses |
| `GET` | `/api/v1/ServerWalletAddresses` | EVM wallet addresses (mainnet/testnet) |

### Ownable Operations

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `POST` | `/api/v1/upload` | `networkType` (mainnet\|testnet) | Upload ownable ZIP (multipart form) |
| `GET` | `/api/v1/resendOwnableByRequestId` | `requestId`, `networkType` | Resend failed ownable |

### Queue Management

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `GET` | `/api/v1/getQueueStatus` | - | Overall queue status |
| `GET` | `/api/v1/getInQueueEntries` | `networkType` | Pending queue entries |
| `GET` | `/api/v1/getProcessingEntries` | `networkType` | Currently processing |
| `GET` | `/api/v1/getReadyEntries` | `networkType` | Ready for claim |
| `GET` | `/api/v1/getSentEntries` | `networkType` | Already sent |
| `GET` | `/api/v1/getQueueEntriesByRequestId` | `requestId`, `networkType` | By request ID |
| `GET` | `/api/v1/getQueueEntriesByWallet` | `wallet` | By wallet address (0x...) |
| `GET` | `/api/v1/getQueueEntriesByStatus` | `status`, `networkType` | By status |
| `GET` | `/api/v1/getLogsByRequestId` | `requestId` | Logs for request |

### Utilities

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `GET` | `/api/v1/templateCost` | `templateId` | Cost for template in USD/EQTY |
| `GET` | `/api/v1/availableChains` | - | Supported EVM chains |
| `GET` | `/api/v1/isRelayServerUp` | - | Relay server health |
| `GET` | `/api/v1/isEVMAddress` | `address` | Validate EVM address (0x...) |

## Network Types

- `mainnet` = Base Mainnet
- `testnet` = Base Sepolia

> **Legacy Support:** `L` (mainnet) and `T` (testnet) are still supported internally for backwards compatibility.

## Queue Statuses

- `IN_QUEUE` - Waiting to be processed
- `PROCESSING` - Currently being processed
- `READY` - Ready for user to claim
- `SENT` - Delivered to user
- `ERROR` - Failed (check logs)

## Authentication

Requests require EIP-712 signed payloads. The signature includes:

- `address`: Your Ethereum wallet address (0x...)
- `timestamp`: Request timestamp (must be within 5 minutes)
- `nonce`: Unique request identifier

### EIP-712 Domain

```typescript
{
  name: 'EQTY oBuilder',
  version: '1',
  chainId: 8453 // Base mainnet (84532 for testnet)
}
```

## Example Requests

```bash
# Health check
curl http://localhost:3000/health

# Get server info
curl http://localhost:3000/api/v1/GetServerInfo

# Get template cost
curl "http://localhost:3000/api/v1/templateCost?templateId=1"

# Check queue status
curl http://localhost:3000/api/v1/getQueueStatus

# Get entries by wallet
curl "http://localhost:3000/api/v1/getQueueEntriesByWallet?wallet=0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15"
```

### Upload Ownable (Full Example)

```bash
# Upload with multipart form data
curl -X POST http://localhost:3000/api/v1/upload \
  -H "Content-Type: multipart/form-data" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15" \
  -F "file=@ownable-package.zip" \
  -F "networkType=testnet" \
  -F "templateId=1"
```

### ownableData.json Structure

```json
{
  "OWNABLE_LTO_TRANSACTION_ID": "0x...",
  "CREATE_NFT": "true",
  "NFT_BLOCKCHAIN": "arbitrum",
  "RECIPIENT_ADDRESS": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15"
}
```

## Error Responses

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errorCode": "VALIDATION_FAILED"
}
```

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_FAILED` | 400 | Invalid input data |
| `INVALID_ADDRESS` | 400 | Invalid EVM address format |
| `INVALID_SIGNATURE` | 401 | EIP-712 signature verification failed |
| `QUEUE_DISABLED` | 503 | Queue temporarily disabled |
| `RELAY_DOWN` | 503 | Relay server unavailable |
| `TEMPLATE_NOT_FOUND` | 404 | Template ID not found |
| `REQUEST_NOT_FOUND` | 404 | Request ID not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Production Deployment

### Environment Variables

```bash
NODE_ENV=production
PORT=3000
S3_BUCKET_OWNABLES_L=your-mainnet-bucket
S3_BUCKET_OWNABLES_T=your-testnet-bucket
RELAY_URL=https://relay.eqty.io
```

### Health Checks

- **Liveness:** `GET /health` (should return 200)
- **Readiness:** `GET /api/v1/getQueueStatus` (includes queue state)
