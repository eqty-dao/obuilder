# oBuilder API Endpoints Documentation

**Base URL:** `/api/v1`

## Core Endpoints

### Health & Server Info

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check for container orchestration |
| `GET` | `/info` | App info |
| `GET` | `/api/v1/GetServerInfo` | Server balances and wallet addresses |
| `GET` | `/api/v1/ServerLtoWalletAddresses` | LTO wallet addresses (mainnet/testnet) |

### Ownable Operations

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `POST` | `/api/v1/upload` | `ltoNetworkId` (L\|T) | Upload ownable ZIP (multipart form) |
| `GET` | `/api/v1/resendOwnableByRequestId` | `requestId`, `ltoNetworkId` | Resend failed ownable |

### Queue Management

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `GET` | `/api/v1/getQueueStatus` | - | Overall queue status |
| `GET` | `/api/v1/getInQueueEntries` | `ltoNetworkId` | Pending queue entries |
| `GET` | `/api/v1/getProcessingEntries` | `ltoNetworkId` | Currently processing |
| `GET` | `/api/v1/getReadyEntries` | `ltoNetworkId` | Ready for claim |
| `GET` | `/api/v1/getSentEntries` | `ltoNetworkId` | Already sent |
| `GET` | `/api/v1/getQueueEntriesByRequestId` | `requestId`, `ltoNetworkId` | By request ID |
| `GET` | `/api/v1/getQueueEntriesByWallet` | `wallet` | By wallet address |
| `GET` | `/api/v1/getQueueEntriesByStatus` | `status`, `ltoNetworkId` | By status |
| `GET` | `/api/v1/getLogsByRequestId` | `requestId` | Logs for request |

### Utilities

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `GET` | `/api/v1/templateCost` | `templateId` | Cost for template in LTO |
| `GET` | `/api/v1/availableChains` | - | Supported EVM chains |
| `GET` | `/api/v1/isRelayServerUp` | - | Relay server health |
| `GET` | `/api/v1/isEVMAddress` | `address` | Validate EVM address |
| `GET` | `/api/v1/isLTOAddress` | `address` | Validate LTO address |

## Network IDs

- `L` = LTO Mainnet
- `T` = LTO Testnet

## Queue Statuses

- `IN_QUEUE` - Waiting to be processed
- `PROCESSING` - Currently being processed
- `READY` - Ready for user to claim
- `SENT` - Delivered to user
- `ERROR` - Failed (check logs)

## Authentication

> **⚠️ NOTE:** Signature verification is currently **DISABLED** in the codebase.
> When re-enabled, requests will require HTTP Message Signatures using LTO account.

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
curl "http://localhost:3000/api/v1/getQueueEntriesByWallet?wallet=3JzW..."
```
