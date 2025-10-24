# oBuilder Logging and Queue Management System

## Overview
The oBuilder uses a comprehensive logging and queue management system to track the entire ownable creation process from user upload to delivery. The system combines in-memory logging, S3 storage, and queue management to provide full traceability.

## Logging System Architecture

### 1. LoggingService
**Location**: `src/logging/logging.service.ts`

**Core Features**:
- **In-Memory Storage**: Logs stored in memory array with structure:
  ```typescript
  { rid: string, level: string, message: string, timestamp: Date }[]
  ```
- **Dual Output**: Console logging + in-memory storage
- **Request ID Tracking**: Each log entry tied to unique request ID (RID)
- **Log Levels**: `info` and `error` levels supported

**Key Methods**:
- `log(rid: string, message: string)` - Info level logging
- `logError(rid: string, message: string)` - Error level logging
- `getLogs()` - Retrieve all logs
- `getLogsByRid(rid: string)` - Retrieve logs for specific request

### 2. S3 Log Storage
**Location**: `src/s3/s3.service.ts`

**S3 Bucket Configuration**:
- **Logs Bucket**: `OBUILDER_BUCKET_LOGS` (default: 'obuilder-logs')
- **Queue Buckets**: 
  - Mainnet: `OWNABLE_BUCKET_QUEUE_MAINNET` (default: 'obuilder-production')
  - Testnet: `OWNABLE_BUCKET_QUEUE_TESTNET` (default: 'obuilder-staging')
- **Ownables Buckets**:
  - Mainnet: `OWNABLES_BUCKET_MAINNET` (default: 'obuilder-ownables-mainnet')
  - Testnet: `OWNABLES_BUCKET_TESTNET` (default: 'obuilder-ownables-testnet')

## Queue Management System

### 1. QueueService
**Location**: `src/queue/queue.service.ts`

**Queue Structure**:
```typescript
interface QueueEntry {
    rid: string;                    // Request ID
    data: string;                   // Base64 encoded zip data
    ltoWallet: string;             // User wallet address
    ltoNetworkId: 'L'|'T';         // Network identifier
    hash: string;                  // Data hash
    txId: string;                  // Transaction ID
    ownableStatus: OwnableStatus;  // Current status
    templateId: number;            // Template used
    timestampInQueue: number;       // Queue entry time
    timestampProcessing: number;    // Processing start time
    timestampReady: number;         // Ready for delivery time
    timestampSent: number;          // Delivery completion time
    timestampFailed: number;        // Failure time
    failedErrMsg: string;          // Error message if failed
    cid: string;                   // Content ID
    reenqueued: boolean;           // Re-queue flag
    reenqueued_NFTURI: string;     // NFT URI for re-queued items
    nftInfo: NftInfo;             // NFT information
    paymentTransactionId?: string;  // Payment transaction ID
}
```

**Queue Status Enum**:
```typescript
enum OwnableStatus {
    Unknown,      // 0
    InQueue,      // 1
    Processing,   // 2
    Ready,        // 3
    Sent,         // 4
    Failed        // 5
}
```

### 2. Queue Processing Flow

#### **Step 1: Request Queuing**
```typescript
// UploadZipService.queueRequest()
1. Extract sender from request
2. Validate relay server connectivity
3. Unzip user input file
4. Generate unique request ID (RID)
5. Validate ownableData.json
6. Check template existence
7. Enqueue request with status 'InQueue'
8. Log: "New Logging Service added for unique request ID"
```

#### **Step 2: Queue Monitoring**
```typescript
// UploadZipService.checkQueueStatus()
1. Check if queue is empty
2. Verify relay server status
3. Check if new entry can be processed
4. Process next queue entry if available
5. Update queue status to 'Processing'
```

#### **Step 3: Ownable Building**
```typescript
// UploadZipService.buildOwnable()
1. Copy template to ownables directory
2. Replace placeholders in template files
3. Execute Rust build commands with logging:
   - cargo --version
   - rustup --version
   - wasm-pack --version
   - npm run ownables:build
4. Create ZIP file
5. Upload to Pinata IPFS
6. Log: "Building Ownable..."
```

#### **Step 4: NFT Minting**
```typescript
// NFTService.mintNewNft()
1. Determine blockchain network
2. Get contract address
3. Mint NFT to server wallet
4. Log: "minting NFT on {network} via NFT contract"
5. Update NFT count
```

#### **Step 5: Event Chain Creation**
```typescript
// EventChainService.createOwnableEventChain()
1. Create event chain using eqty-core
2. Add ownable metadata events
3. Sign events with server wallet
4. Anchor to Base blockchain
5. Log: "Event chain created successfully"
```

#### **Step 6: Delivery**
```typescript
// RelayService.sendFile() & sendTypedPackage()
1. Create message using eqty-core
2. Sign message with server wallet
3. Send to relay server
4. Update queue status to 'Sent'
5. Log: "Message successfully sent to relay"
```

## Build Process Logging Flow

### **Complete Build Process with Logging**:

```
1. REQUEST RECEIVED
   ├── Log: "New Logging Service added for unique request ID: {rid}"
   ├── Log: "unzipping user input file into memory..."
   └── Log: "getting request ID of input requestIdFiles..."

2. VALIDATION
   ├── Log: "Validating template ID: {templateId}"
   ├── Log: "Template exists: true/false"
   └── Log: "NFT blockchain validation passed"

3. QUEUE ENTRY
   ├── Log: "Enqueuing request: {rid}"
   ├── Log: "Queue entry created with status: InQueue"
   └── Log: "Request queued successfully"

4. PROCESSING START
   ├── Log: "Processing queue entry: {rid}"
   ├── Log: "Updating queue entry status: {rid} to Processing"
   └── Log: "Creating Ownable for request ID {rid}..."

5. TEMPLATE PROCESSING
   ├── Log: "Copying template{templateId} to template directory"
   ├── Log: "Replacing placeholders in template files"
   └── Log: "Template processing completed"

6. RUST BUILD PROCESS
   ├── Log: "Executing command: cargo --version"
   ├── Log: "Command output: cargo 1.70.0..."
   ├── Log: "Executing command: rustup --version"
   ├── Log: "Command output: rustup 1.25.1..."
   ├── Log: "Executing command: wasm-pack --version"
   ├── Log: "Command output: wasm-pack 0.12.1..."
   ├── Log: "Building Ownable..."
   ├── Log: "Executing command: npm run ownables:build --package={name}"
   └── Log: "Build completed successfully"

7. ZIP CREATION
   ├── Log: "Creating ZIP file: {name}.zip"
   ├── Log: "ZIP file created successfully"
   └── Log: "ZIP file size: {size} bytes"

8. IPFS UPLOAD
   ├── Log: "Uploading to Pinata IPFS..."
   ├── Log: "IPFS upload successful"
   └── Log: "IPFS hash: {hash}"

9. NFT MINTING
   ├── Log: "minting NFT on {network} via NFT contract at: {address}"
   ├── Log: "nftOwner {address}"
   ├── Log: "nftTokenURI {uri}"
   ├── Log: "NFT_BLOCKCHAIN {blockchain}"
   └── Log: "nftcount {count}"

10. EVENT CHAIN CREATION
    ├── Log: "Creating event chain for user: {address} on network: {network}"
    ├── Log: "Event chain created successfully"
    ├── Log: "Event added and signed successfully"
    └── Log: "Event chain anchored to Base blockchain"

11. PAYMENT PROCESSING
    ├── Log: "Found signed transaction for request ID: {rid}"
    ├── Log: "Broadcasting payment transaction before sending ownable..."
    ├── Log: "Transaction broadcast successful with ID: {id}"
    └── Log: "Payment transaction validated"

12. DELIVERY
    ├── Log: "Sending File with sender:{sender} and recipient:{recipient}"
    ├── Log: "Message hash: {hash}"
    ├── Log: "Message successfully sent to relay"
    ├── Log: "Sending Typed Package with sender:{sender} and recipient:{recipient}"
    └── Log: "Typed package sent successfully"

13. COMPLETION
    ├── Log: "Updating queue entry status: {rid} to Sent"
    ├── Log: "Ownable creation completed successfully"
    └── Log: "Request {rid} processed and delivered"
```

## Error Handling and Logging

### **Error Scenarios**:
```typescript
// Template validation errors
Log: "Template not found: {templateId}"
Log: "Invalid template ID: {templateId}"

// Build process errors
Log: "Command failed: {command} - {error.message}"
Log: "Build process failed: {error}"

// NFT minting errors
Log: "Minting new NFT failed {error}"
Log: "Unsupported Blockchain: {blockchain}"

// Relay communication errors
Log: "Failed to send message to relay: {error}"
Log: "Relay Server {url} is down"

// Queue processing errors
Log: "processNextQueueEntry failed on lto network {network}: {error}"
Log: "Ownable creation failed on lto network {network}: {error}"
```

## Log Storage and Retrieval

### **In-Memory Logs**:
- Stored in `LoggingService.logs` array
- Available during application runtime
- Can be retrieved by request ID

### **S3 Persistent Storage**:
- Queue data stored in S3 buckets
- Logs can be persisted to S3 for long-term storage
- Network-specific bucket separation

### **Console Output**:
- Real-time console logging for debugging
- Format: `Info: {rid}: {message}` or `Error: {rid}: {message}`

## Monitoring and Alerting

### **Telegram Integration**:
- Failed builds trigger Telegram notifications
- Queue status updates sent to configured channels
- Error alerts for critical failures

### **Queue Status Monitoring**:
- Real-time queue status checking
- Processing time tracking
- Failed entry detection and cleanup

## Performance Considerations

### **Log Volume**:
- Each build generates 50+ log entries
- High-frequency logging during build process
- Memory usage grows with concurrent requests

### **S3 Operations**:
- Queue updates written to S3 after each status change
- Network-specific bucket operations
- Error handling prevents S3 failures from breaking workflow

## Security and Privacy

### **Sensitive Data**:
- Wallet addresses logged
- Transaction IDs tracked
- IPFS hashes recorded
- No private keys or mnemonics logged

### **Data Retention**:
- In-memory logs cleared on restart
- S3 logs persist based on bucket policies
- Queue data maintained for audit purposes
