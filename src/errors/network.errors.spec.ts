import { describe, it, expect } from 'vitest';
import {
    RelayUnreachableError,
    LtoNodeUnreachableError,
    IPFSPinningError,
    IPFSGatewayError,
    EvmRpcUnreachableError,
    AnchoringError,
    MintingError,
    S3StorageError,
    ExternalRateLimitError,
    ServiceTimeoutError,
} from './network.errors';
import { isOBuilderError } from './base.error';

describe('network.errors', () => {
    describe('RelayUnreachableError', () => {
        it('should have correct tag and status', () => {
            const error = new RelayUnreachableError();
            expect(error._tag).toBe('RelayUnreachableError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('RELAY_UNREACHABLE');
        });

        it('should capture cause', () => {
            const cause = new Error('Connection refused');
            const error = new RelayUnreachableError(cause);
            expect(error.cause).toBe(cause);
        });

        it('should be OBuilderError', () => {
            const error = new RelayUnreachableError();
            expect(isOBuilderError(error)).toBe(true);
        });
    });

    describe('LtoNodeUnreachableError', () => {
        it('should have correct tag and status', () => {
            const error = new LtoNodeUnreachableError('https://nodes.lto.network');
            expect(error._tag).toBe('LtoNodeUnreachableError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('LTO_NODE_UNREACHABLE');
        });

        it('should include node URL', () => {
            const error = new LtoNodeUnreachableError('https://custom-node.example.com');
            expect(error.message).toContain('https://custom-node.example.com');
        });

        it('should capture cause', () => {
            const cause = new Error('DNS error');
            const error = new LtoNodeUnreachableError('url', cause);
            expect(error.cause).toBe(cause);
        });
    });

    describe('IPFSPinningError', () => {
        it('should have correct tag and status', () => {
            const error = new IPFSPinningError('timeout');
            expect(error._tag).toBe('IPFSPinningError');
            expect(error.httpStatus).toBe(502);
            expect(error.code).toBe('IPFS_PINNING_FAILED');
        });

        it('should include reason', () => {
            const error = new IPFSPinningError('file too large');
            expect(error.message).toContain('file too large');
        });

        it('should capture cause', () => {
            const cause = new Error('Rate limit');
            const error = new IPFSPinningError('reason', cause);
            expect(error.cause).toBe(cause);
        });
    });

    describe('IPFSGatewayError', () => {
        it('should have correct tag and status', () => {
            const error = new IPFSGatewayError('https://ipfs.io');
            expect(error._tag).toBe('IPFSGatewayError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('IPFS_GATEWAY_UNREACHABLE');
        });

        it('should include gateway URL', () => {
            const error = new IPFSGatewayError('https://gateway.pinata.cloud');
            expect(error.message).toContain('https://gateway.pinata.cloud');
        });
    });

    describe('EvmRpcUnreachableError', () => {
        it('should have correct tag and status', () => {
            const error = new EvmRpcUnreachableError('base');
            expect(error._tag).toBe('EvmRpcUnreachableError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('EVM_RPC_UNREACHABLE');
        });

        it('should include chain name', () => {
            const error = new EvmRpcUnreachableError('ethereum');
            expect(error.message).toContain('ethereum');
        });
    });

    describe('AnchoringError', () => {
        it('should have correct tag and status', () => {
            const error = new AnchoringError('gas too low');
            expect(error._tag).toBe('AnchoringError');
            expect(error.httpStatus).toBe(502);
            expect(error.code).toBe('ANCHORING_FAILED');
        });

        it('should include reason', () => {
            const error = new AnchoringError('transaction reverted');
            expect(error.message).toContain('transaction reverted');
        });
    });

    describe('MintingError', () => {
        it('should have correct tag and status', () => {
            const error = new MintingError('base', 'out of gas');
            expect(error._tag).toBe('MintingError');
            expect(error.httpStatus).toBe(502);
            expect(error.code).toBe('MINTING_FAILED');
        });

        it('should include chain and reason', () => {
            const error = new MintingError('polygon', 'contract paused');
            expect(error.message).toContain('polygon');
            expect(error.message).toContain('contract paused');
        });
    });

    describe('S3StorageError', () => {
        it('should have correct tag and status', () => {
            const error = new S3StorageError('upload');
            expect(error._tag).toBe('S3StorageError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('S3_STORAGE_ERROR');
        });

        it('should handle upload operation', () => {
            const error = new S3StorageError('upload');
            expect(error.message).toContain('upload');
        });

        it('should handle download operation', () => {
            const error = new S3StorageError('download');
            expect(error.message).toContain('download');
        });

        it('should handle delete operation', () => {
            const error = new S3StorageError('delete');
            expect(error.message).toContain('delete');
        });
    });

    describe('ExternalRateLimitError', () => {
        it('should have correct tag and status', () => {
            const error = new ExternalRateLimitError('Pinata');
            expect(error._tag).toBe('ExternalRateLimitError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('EXTERNAL_RATE_LIMIT');
        });

        it('should include service name', () => {
            const error = new ExternalRateLimitError('CoinMarketCap');
            expect(error.message).toContain('CoinMarketCap');
        });

        it('should include retry time when provided', () => {
            const error = new ExternalRateLimitError('Alchemy', 30);
            expect(error.message).toContain('30s');
        });
    });

    describe('ServiceTimeoutError', () => {
        it('should have correct tag and status', () => {
            const error = new ServiceTimeoutError('IPFS', 30000);
            expect(error._tag).toBe('ServiceTimeoutError');
            expect(error.httpStatus).toBe(504);
            expect(error.code).toBe('SERVICE_TIMEOUT');
        });

        it('should include service and timeout', () => {
            const error = new ServiceTimeoutError('LTO Node', 5000);
            expect(error.message).toContain('LTO Node');
            expect(error.message).toContain('5000ms');
        });
    });

    describe('toJSON serialization', () => {
        it('should serialize network errors correctly', () => {
            const errors = [
                new RelayUnreachableError(),
                new LtoNodeUnreachableError('https://node.lto'),
                new IPFSPinningError('timeout'),
                new S3StorageError('upload'),
                new ServiceTimeoutError('API', 1000),
            ];

            for (const error of errors) {
                const json = error.toJSON();
                expect(json.error).toBe(error._tag);
                expect(json.message).toBe(error.message);
                expect(json.code).toBe(error.code);
                expect(json.timestamp).toBeDefined();
            }
        });
    });
});
