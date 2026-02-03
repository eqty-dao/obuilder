import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    EvmAddressSchema,
    RecipientAddressSchema,
    NetworkTypeSchema,
    LegacyNetworkIdSchema,
    EvmChainSchema,
    EvmTransactionHashSchema,
    TransactionIdSchema,
    TemplateIdSchema,
    QueueOwnableRequestSchema,
    UploadOwnableRequestSchema,
    MintNftRequestSchema,
    IpfsCidSchema,
    validateOrThrow,
    validateSafe,
    legacyNetworkIdToType,
    networkTypeToLegacyId,
} from './schemas';

describe('Validation Schemas', () => {
    describe('EvmAddressSchema', () => {
        it('should accept valid EVM address', () => {
            const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';
            expect(EvmAddressSchema.parse(validAddress)).toBe(validAddress);
        });

        it('should accept lowercase EVM address', () => {
            const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
            expect(EvmAddressSchema.parse(validAddress)).toBe(validAddress);
        });

        it('should reject address without 0x prefix', () => {
            expect(() => EvmAddressSchema.parse('742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toThrow();
        });

        it('should reject address with wrong length', () => {
            expect(() => EvmAddressSchema.parse('0x742d35Cc6634C0532925a3b844Bc9e')).toThrow();
        });

        it('should reject address with invalid characters', () => {
            expect(() => EvmAddressSchema.parse('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toThrow();
        });

        it('should reject empty string', () => {
            expect(() => EvmAddressSchema.parse('')).toThrow();
        });
    });

    describe('RecipientAddressSchema', () => {
        it('should accept valid EVM address (same as EvmAddressSchema)', () => {
            const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';
            expect(RecipientAddressSchema.parse(validAddress)).toBe(validAddress);
        });
    });

    describe('NetworkTypeSchema', () => {
        it('should accept mainnet', () => {
            expect(NetworkTypeSchema.parse('mainnet')).toBe('mainnet');
        });

        it('should accept testnet', () => {
            expect(NetworkTypeSchema.parse('testnet')).toBe('testnet');
        });

        it('should reject invalid network type', () => {
            expect(() => NetworkTypeSchema.parse('devnet')).toThrow();
        });

        it('should reject empty string', () => {
            expect(() => NetworkTypeSchema.parse('')).toThrow();
        });
    });

    describe('LegacyNetworkIdSchema', () => {
        it('should accept L for mainnet', () => {
            expect(LegacyNetworkIdSchema.parse('L')).toBe('L');
        });

        it('should accept T for testnet', () => {
            expect(LegacyNetworkIdSchema.parse('T')).toBe('T');
        });

        it('should reject invalid legacy network ID', () => {
            expect(() => LegacyNetworkIdSchema.parse('M')).toThrow();
        });

        it('should reject lowercase', () => {
            expect(() => LegacyNetworkIdSchema.parse('l')).toThrow();
        });
    });

    describe('EvmChainSchema', () => {
        it('should accept ethereum', () => {
            expect(EvmChainSchema.parse('ethereum')).toBe('ethereum');
        });

        it('should accept arbitrum', () => {
            expect(EvmChainSchema.parse('arbitrum')).toBe('arbitrum');
        });

        it('should accept polygon', () => {
            expect(EvmChainSchema.parse('polygon')).toBe('polygon');
        });

        it('should accept base', () => {
            expect(EvmChainSchema.parse('base')).toBe('base');
        });

        it('should reject invalid chain', () => {
            expect(() => EvmChainSchema.parse('solana')).toThrow();
        });
    });

    describe('EvmTransactionHashSchema', () => {
        it('should accept valid 66-char transaction hash', () => {
            const validHash = '0x' + 'a'.repeat(64);
            expect(EvmTransactionHashSchema.parse(validHash)).toBe(validHash);
        });

        it('should accept mixed case transaction hash', () => {
            const validHash = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf1234567890AbCdEf1234567890';
            expect(EvmTransactionHashSchema.parse(validHash)).toBe(validHash);
        });

        it('should reject hash without 0x prefix', () => {
            const invalidHash = 'a'.repeat(64);
            expect(() => EvmTransactionHashSchema.parse(invalidHash)).toThrow();
        });

        it('should reject hash with wrong length', () => {
            const invalidHash = '0x' + 'a'.repeat(32);
            expect(() => EvmTransactionHashSchema.parse(invalidHash)).toThrow();
        });
    });

    describe('TransactionIdSchema', () => {
        it('should accept EVM transaction hash', () => {
            const validHash = '0x' + 'a'.repeat(64);
            expect(TransactionIdSchema.parse(validHash)).toBe(validHash);
        });

        it('should accept legacy transaction ID format', () => {
            const legacyId = 'Abc123XYZ456abc123XYZ456abc123XYZ4567890';
            expect(TransactionIdSchema.parse(legacyId)).toBe(legacyId);
        });

        it('should reject too short transaction ID', () => {
            expect(() => TransactionIdSchema.parse('short')).toThrow();
        });
    });

    describe('TemplateIdSchema', () => {
        it('should accept valid template ID', () => {
            expect(TemplateIdSchema.parse(1)).toBe(1);
        });

        it('should accept max template ID', () => {
            expect(TemplateIdSchema.parse(1000)).toBe(1000);
        });

        it('should reject zero', () => {
            expect(() => TemplateIdSchema.parse(0)).toThrow();
        });

        it('should reject negative number', () => {
            expect(() => TemplateIdSchema.parse(-1)).toThrow();
        });

        it('should reject number above max', () => {
            expect(() => TemplateIdSchema.parse(1001)).toThrow();
        });

        it('should reject non-integer', () => {
            expect(() => TemplateIdSchema.parse(1.5)).toThrow();
        });
    });

    describe('QueueOwnableRequestSchema', () => {
        const validRequest = {
            templateId: 1,
            recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
            transactionId: '0x' + 'a'.repeat(64),
        };

        it('should accept valid request with defaults', () => {
            const result = QueueOwnableRequestSchema.parse(validRequest);
            expect(result.templateId).toBe(1);
            expect(result.networkType).toBe('testnet'); // default
            expect(result.chain).toBe('base'); // default
        });

        it('should accept request with explicit network type', () => {
            const result = QueueOwnableRequestSchema.parse({
                ...validRequest,
                networkType: 'mainnet',
            });
            expect(result.networkType).toBe('mainnet');
        });

        it('should accept request with metadata', () => {
            const result = QueueOwnableRequestSchema.parse({
                ...validRequest,
                metadata: { custom: 'data' },
            });
            expect(result.metadata).toEqual({ custom: 'data' });
        });

        it('should reject invalid recipient', () => {
            expect(() => QueueOwnableRequestSchema.parse({
                ...validRequest,
                recipient: 'invalid',
            })).toThrow();
        });
    });

    describe('UploadOwnableRequestSchema', () => {
        const validRequest = {
            receiver: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
            templateId: 1,
            transactionId: '0x' + 'a'.repeat(64),
        };

        it('should accept valid upload request', () => {
            const result = UploadOwnableRequestSchema.parse(validRequest);
            expect(result.receiver).toBe(validRequest.receiver);
            expect(result.networkType).toBe('testnet'); // default
        });

        it('should accept request with explicit chain', () => {
            const result = UploadOwnableRequestSchema.parse({
                ...validRequest,
                chain: 'polygon',
            });
            expect(result.chain).toBe('polygon');
        });
    });

    describe('MintNftRequestSchema', () => {
        it('should accept valid mint request', () => {
            const validRequest = {
                tokenUri: 'https://example.com/metadata.json',
                recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
                chain: 'base',
            };
            const result = MintNftRequestSchema.parse(validRequest);
            expect(result.tokenUri).toBe(validRequest.tokenUri);
        });

        it('should reject invalid URL', () => {
            expect(() => MintNftRequestSchema.parse({
                tokenUri: 'not-a-url',
                recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
                chain: 'base',
            })).toThrow();
        });
    });

    describe('IpfsCidSchema', () => {
        it('should accept CIDv0 (Qm...)', () => {
            const cidV0 = 'Qm' + 'a'.repeat(44);
            expect(IpfsCidSchema.parse(cidV0)).toBe(cidV0);
        });

        it('should accept CIDv1 (bafy...)', () => {
            const cidV1 = 'bafy' + 'a'.repeat(55);
            expect(IpfsCidSchema.parse(cidV1)).toBe(cidV1);
        });

        it('should reject invalid CID format', () => {
            expect(() => IpfsCidSchema.parse('invalid-cid')).toThrow();
        });

        it('should reject CID with wrong prefix', () => {
            expect(() => IpfsCidSchema.parse('Qx' + 'a'.repeat(44))).toThrow();
        });
    });

    describe('validateOrThrow', () => {
        it('should return parsed value for valid input', () => {
            const result = validateOrThrow(z.string(), 'hello');
            expect(result).toBe('hello');
        });

        it('should throw ZodError for invalid input', () => {
            expect(() => validateOrThrow(z.number(), 'not a number')).toThrow(z.ZodError);
        });
    });

    describe('validateSafe', () => {
        it('should return success: true with data for valid input', () => {
            const result = validateSafe(z.string(), 'hello');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe('hello');
            }
        });

        it('should return success: false with error for invalid input', () => {
            const result = validateSafe(z.number(), 'not a number');
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(z.ZodError);
            }
        });
    });

    describe('legacyNetworkIdToType', () => {
        it('should convert L to mainnet', () => {
            expect(legacyNetworkIdToType('L')).toBe('mainnet');
        });

        it('should convert T to testnet', () => {
            expect(legacyNetworkIdToType('T')).toBe('testnet');
        });
    });

    describe('networkTypeToLegacyId', () => {
        it('should convert mainnet to L', () => {
            expect(networkTypeToLegacyId('mainnet')).toBe('L');
        });

        it('should convert testnet to T', () => {
            expect(networkTypeToLegacyId('testnet')).toBe('T');
        });
    });
});
