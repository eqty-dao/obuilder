# oBuilder Testing Guide

This guide provides multiple ways to test the oBuilder API with template uploads, images, and all necessary inputs.

## 🚀 Quick Start

### 1. Start oBuilder

```bash
cd oBuilder
npm run start:dev
```

### 2. Test Methods

#### Method A: Web Interface (Recommended)

1. Open `test-interface.html` in your browser
2. Fill in the form with:
   - Template ID (1, 2, or 3)
   - Network (L for mainnet, T for testnet)
   - Ownable name and description
   - Upload an image file
   - Add optional attributes (JSON format)
3. Click "Upload & Build Ownable"

#### Method B: Command Line Script

```bash
# Install test dependencies
npm install form-data node-fetch jszip --save-dev

# Run basic test
node test-api.js

# Test specific template
TEMPLATE_ID=2 node test-api.js

# Test on mainnet
NETWORK_ID=L node test-api.js
```

#### Method C: cURL Command

```bash
curl -X POST "http://localhost:3000/api/v1/upload?ltoNetworkId=T" \
  -F "file=@test-ownable.zip" \
  -F "templateId=1" \
  -F "name=Test Ownable"
```

## 📋 Available Templates

| Template ID | Name     | Description      | Features                       |
| ----------- | -------- | ---------------- | ------------------------------ |
| 1           | Basic    | Simple ownable   | Basic metadata, single image   |
| 2           | Media    | Media ownable    | HTML assets, media playback    |
| 3           | Advanced | Advanced ownable | Custom features, complex logic |

## 🔧 API Endpoints

### Upload Endpoint

- **URL**: `POST /api/v1/upload`
- **Query Params**:
  - `ltoNetworkId`: 'L' (mainnet) or 'T' (testnet)
- **Body**:
  - `file`: ZIP file containing ownable package
  - `templateId`: Template ID (1, 2, or 3)
  - `name`: Ownable name
  - `signedTransaction`: Optional signed transaction

### Queue Status

- **URL**: `GET /api/v1/queue-status`
- **Response**: Current queue status and statistics

### Individual Request Status

- **URL**: `GET /api/v1/queue-status/{requestId}`
- **Response**: Status of specific request

## 📦 ZIP Package Structure

The uploaded ZIP file should contain:

```
ownable-package.zip
├── ownableData.json    # Main ownable configuration
├── chain.json          # Blockchain configuration
├── image.png          # Main image file
└── [other assets]     # Additional files as needed
```

### ownableData.json Example

```json
{
  "templateId": 1,
  "type": "basic",
  "metadata": {
    "title": "My Ownable",
    "description": "A test ownable",
    "attributes": {
      "rarity": "common",
      "category": "digital art"
    }
  },
  "generatedAt": "2024-01-01T00:00:00.000Z"
}
```

### chain.json Example

```json
{
  "networkId": "T",
  "timestamp": 1704067200000,
  "version": "1.0.0"
}
```

## 🧪 Test Scenarios

### Basic Test

1. Upload template 1 with a simple image
2. Verify queue processing
3. Check NFT creation

### Media Test

1. Upload template 2 with media files
2. Test HTML asset rendering
3. Verify media playback

### Advanced Test

1. Upload template 3 with complex attributes
2. Test custom logic execution
3. Verify advanced features

### Error Handling Test

1. Upload invalid ZIP file
2. Upload with missing required fields
3. Upload with invalid template ID

## 🔍 Monitoring

### Queue Status

```bash
curl http://localhost:3000/api/v1/queue-status
```

### Redis Monitoring

```bash
curl http://localhost:3000/redis/health
curl http://localhost:3000/redis/queue
curl http://localhost:3000/redis/logs
```

### Logs

```bash
# Check application logs
tail -f logs/obuilder.log

# Check Redis logs
redis-cli monitor
```

## 🐛 Troubleshooting

### Common Issues

1. **"Template not found"**

   - Verify template ID exists in `/storage/ownable-templates/`
   - Check template directory structure

2. **"Invalid package"**

   - Ensure ZIP contains `ownableData.json`
   - Verify JSON format is valid

3. **"Queue disabled"**

   - Check Redis connection
   - Verify queue service is running

4. **"Relay server down"**
   - Check relay service status
   - Verify relay URL configuration

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm run start:dev

# Check Redis connection
redis-cli ping

# Check queue entries
redis-cli keys "*queue*"
```

## 📊 Expected Results

### Successful Upload

- HTTP 200 response
- Request ID returned
- Entry added to queue
- Processing begins automatically

### Queue Processing

- Status changes: InQueue → Processing → Ready → Sent
- Logs show progress
- NFT created on blockchain
- Relay notification sent

### Final State

- Ownable deployed
- NFT minted
- Metadata stored
- Event chain created

## 🔗 Integration with eqty-ownable-builder

The eqty-ownable-builder web app can be configured to use this oBuilder instance:

1. Set `VITE_OBUILDER_URL=http://localhost:3000`
2. Configure template mappings
3. Update API endpoints
4. Test end-to-end flow

## 📝 Notes

- Templates are stored in `/storage/ownable-templates/`
- Queue data is stored in Redis
- Logs are stored in Redis and optionally S3
- Images are processed and resized automatically
- All operations are logged for debugging
