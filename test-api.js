#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Configuration
const API_BASE_URL = 'http://localhost:3000/api/v1';
const TEMPLATE_ID = 1; // Change this to test different templates
const NETWORK_ID = 'T'; // 'L' for mainnet, 'T' for testnet

// Test data
const testOwnableData = {
  templateId: TEMPLATE_ID,
  type: TEMPLATE_ID === 1 ? 'basic' : TEMPLATE_ID === 2 ? 'media' : 'advanced',
  metadata: {
    title: 'Test Ownable',
    description: 'This is a test ownable created via API',
    attributes: {
      rarity: 'common',
      category: 'test',
      created_by: 'api_test',
    },
  },
  media:
    TEMPLATE_ID !== 1
      ? {
          mediaType: 'image/png',
          mediaSource: '',
          coverUrl: '',
          backdropUrl: '',
        }
      : undefined,
  generatedAt: new Date().toISOString(),
};

const chainData = {
  networkId: NETWORK_ID,
  timestamp: Date.now(),
  version: '1.0.0',
};

async function createTestZip() {
  const JSZip = require('jszip');
  const zip = new JSZip();

  // Add ownable data
  zip.file('ownableData.json', JSON.stringify(testOwnableData, null, 2));

  // Add chain data
  zip.file('chain.json', JSON.stringify(chainData, null, 2));

  // Add a simple test image (create a minimal PNG)
  const testImageBuffer = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR chunk
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01, // 1x1 pixel
    0x08,
    0x02,
    0x00,
    0x00,
    0x00,
    0x90,
    0x77,
    0x53,
    0xde, // color type, compression, etc.
    0x00,
    0x00,
    0x00,
    0x0c,
    0x49,
    0x44,
    0x41,
    0x54, // IDAT chunk
    0x08,
    0x99,
    0x01,
    0x01,
    0x00,
    0x00,
    0x00,
    0xff,
    0xff,
    0x00,
    0x00,
    0x00,
    0x02,
    0x00,
    0x01, // minimal PNG data
    0x00,
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4e,
    0x44,
    0xae,
    0x42,
    0x60,
    0x82, // IEND chunk
  ]);
  zip.file('image.png', testImageBuffer);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

async function uploadToBuilder(zipBuffer) {
  console.log('🚀 Creating test zip file...');

  const formData = new FormData();
  formData.append('file', zipBuffer, {
    filename: 'test-ownable.zip',
    contentType: 'application/zip',
  });
  formData.append('templateId', TEMPLATE_ID.toString());
  formData.append('name', testOwnableData.metadata.title);

  console.log(
    `📤 Uploading to oBuilder (Template ${TEMPLATE_ID}, Network ${NETWORK_ID})...`,
  );

  try {
    const response = await fetch(
      `${API_BASE_URL}/upload?ltoNetworkId=${NETWORK_ID}`,
      {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
      },
    );

    console.log(`📊 Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Upload successful!');
    console.log('📋 Response:', JSON.stringify(result, null, 2));

    if (result.requestId) {
      console.log(`🔍 Request ID: ${result.requestId}`);
      console.log(
        `🌐 Check status at: ${API_BASE_URL}/queue-status/${result.requestId}`,
      );
    }
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    process.exit(1);
  }
}

async function checkQueueStatus() {
  console.log('\n📊 Checking queue status...');

  try {
    const response = await fetch(`${API_BASE_URL}/queue-status`);
    const status = await response.json();

    console.log('📈 Queue Status:');
    console.log(JSON.stringify(status, null, 2));
  } catch (error) {
    console.error('❌ Failed to check queue status:', error.message);
  }
}

async function main() {
  console.log('🧪 oBuilder API Test Script');
  console.log('============================');
  console.log(`Template ID: ${TEMPLATE_ID}`);
  console.log(`Network ID: ${NETWORK_ID}`);
  console.log(`API URL: ${API_BASE_URL}`);
  console.log('');

  try {
    // Check if oBuilder is running
    console.log('🔍 Checking if oBuilder is running...');
    const healthResponse = await fetch(
      `${API_BASE_URL.replace('/api/v1', '')}/health`,
    );
    if (!healthResponse.ok) {
      throw new Error('oBuilder is not running or not accessible');
    }
    console.log('✅ oBuilder is running');

    // Create and upload test zip
    const zipBuffer = await createTestZip();
    await uploadToBuilder(zipBuffer);

    // Check queue status
    await checkQueueStatus();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main();
}

module.exports = { createTestZip, uploadToBuilder, checkQueueStatus };
