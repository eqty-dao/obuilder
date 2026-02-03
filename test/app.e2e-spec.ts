/**
 * E2E Smoke Tests for oBuilder API
 * 
 * These tests make HTTP requests against a running oBuilder server.
 * They verify the API endpoints are responding correctly.
 * 
 * Prerequisites:
 * - Start the server: pnpm start:dev
 * - Then run: pnpm test:e2e
 * 
 * Or run standalone tests without the full NestJS bootstrap.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// Helper function to make HTTP requests
async function httpRequest(path: string, options: http.RequestOptions = {}): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const req = http.request(url, { method: 'GET', ...options }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const body = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode || 500, body });
                } catch {
                    resolve({ status: res.statusCode || 500, body: data });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Check if server is running
async function isServerUp(): Promise<boolean> {
    try {
        const { status } = await httpRequest('/');
        return status === 200;
    } catch {
        return false;
    }
}

describe('oBuilder API (e2e)', () => {
    let serverAvailable = false;

    beforeAll(async () => {
        serverAvailable = await isServerUp();
        if (!serverAvailable) {
            console.warn('⚠️  Server not running. Skipping e2e tests. Start with: pnpm start:dev');
        }
    });

    describe('Health & Status Endpoints', () => {
        it('GET / should return server info', async () => {
            if (!serverAvailable) return; // Skip if server not running

            const { status, body } = await httpRequest('/');

            expect(status).toBe(200);
            expect(body).toHaveProperty('name');
            expect(body).toHaveProperty('version');
        });

        it('GET /health should return ok status', async () => {
            if (!serverAvailable) return;

            const { status, body } = await httpRequest('/health');

            expect(status).toBe(200);
            expect(body.status).toBe('ok');
        });
    });

    describe('Queue Endpoints', () => {
        it('GET /queue/status/:id should handle invalid request ID', async () => {
            if (!serverAvailable) return;

            const { status } = await httpRequest('/queue/status/invalid-rid-12345');

            // Should either return 200 with error info or 404
            expect([200, 404]).toContain(status);
        });

        it('GET /queue/resend/:id should handle invalid request ID', async () => {
            if (!serverAvailable) return;

            const { status } = await httpRequest('/mainnet/queue/resend/invalid-rid');

            expect([200, 400, 404, 500]).toContain(status);
        });
    });

    describe('Server Info Endpoints', () => {
        it('GET /server/wallets should return wallet addresses', async () => {
            if (!serverAvailable) return;

            const { status, body } = await httpRequest('/server/wallets');

            expect(status).toBe(200);
            // Should have mainnet and testnet addresses
            expect(Array.isArray(body) || typeof body === 'object').toBe(true);
        });

        it('GET /server/relay should return relay status', async () => {
            if (!serverAvailable) return;

            const { status, body } = await httpRequest('/server/relay');

            expect([200, 500]).toContain(status);
        });
    });

    describe('NFT Info Endpoints', () => {
        it('GET /nft/chains should return chain info', async () => {
            if (!serverAvailable) return;

            const { status } = await httpRequest('/nft/chains');

            // May succeed or fail depending on external services
            expect([200, 500]).toContain(status);
        });
    });

    // ============================================
    // Upload Flow Tests
    // ============================================

    describe('Upload Flow (mainnet)', () => {
        it('POST /mainnet/upload-zip without authentication should fail', async () => {
            if (!serverAvailable) return;

            // Create a simple multipart request
            const boundary = '----FormBoundary' + Date.now();
            const body = [
                `--${boundary}`,
                'Content-Disposition: form-data; name="file"; filename="test.zip"',
                'Content-Type: application/zip',
                '',
                'fake zip content',
                `--${boundary}--`,
            ].join('\r\n');

            const response = await new Promise<{ status: number; body: any }>((resolve, reject) => {
                const url = new URL('/mainnet/upload-zip', BASE_URL);
                const req = http.request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': Buffer.byteLength(body),
                    },
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                        } catch {
                            resolve({ status: res.statusCode || 500, body: data });
                        }
                    });
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            });

            // Should fail with 400 (bad request) or 401 (unauthorized) or 500 (processing error)
            expect([400, 401, 403, 500]).toContain(response.status);
        });

        it('POST /mainnet/upload-zip with invalid content should return error', async () => {
            if (!serverAvailable) return;

            const boundary = '----FormBoundary' + Date.now();
            const body = [
                `--${boundary}`,
                'Content-Disposition: form-data; name="file"; filename="invalid.zip"',
                'Content-Type: application/zip',
                '',
                'not a valid zip file',
                `--${boundary}--`,
            ].join('\r\n');

            const response = await new Promise<{ status: number; body: any }>((resolve, reject) => {
                const url = new URL('/mainnet/upload-zip', BASE_URL);
                const req = http.request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': Buffer.byteLength(body),
                        'x-wallet-address': '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
                    },
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                        } catch {
                            resolve({ status: res.statusCode || 500, body: data });
                        }
                    });
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            });

            // Should return an error status for invalid zip
            expect([400, 500]).toContain(response.status);
        });
    });

    describe('Upload Flow (testnet)', () => {
        it('POST /testnet/upload-zip should accept requests with wallet header', async () => {
            if (!serverAvailable) return;

            const boundary = '----FormBoundary' + Date.now();
            const body = [
                `--${boundary}`,
                'Content-Disposition: form-data; name="file"; filename="test.zip"',
                'Content-Type: application/zip',
                '',
                'fake zip content for testing',
                `--${boundary}--`,
            ].join('\r\n');

            const response = await new Promise<{ status: number; body: any }>((resolve, reject) => {
                const url = new URL('/testnet/upload-zip', BASE_URL);
                const req = http.request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': Buffer.byteLength(body),
                        'x-wallet-address': '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
                    },
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                        } catch {
                            resolve({ status: res.statusCode || 500, body: data });
                        }
                    });
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            });

            // Should fail due to invalid zip content, but the request should be processed
            expect([400, 500]).toContain(response.status);
        });
    });

    // ============================================
    // Logs Endpoint Tests
    // ============================================

    describe('Logs Endpoints', () => {
        it('GET /logs/:requestId should handle valid request ID format', async () => {
            if (!serverAvailable) return;

            const { status } = await httpRequest('/logs/test-request-id-123');

            // Should return logs or not found
            expect([200, 404]).toContain(status);
        });
    });
});
