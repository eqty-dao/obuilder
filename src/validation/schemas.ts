/**
 * Zod Validation Schemas
 * 
 * Runtime type validation for all API inputs.
 * Ensures type safety at the boundary between external data and internal processing.
 * 
 * DAO Compliance Note:
 * - These schemas validate input format only
 * - They do NOT change ownership semantics or anchoring logic
 * - Private data remains private (validation happens before any logging)
 * 
 * Network: Base blockchain (Coinbase L2)
 */

import { z } from 'zod';

// ============================================================
// Address Schemas
// ============================================================

/**
 * EVM address validation (Ethereum, Base, Arbitrum, Polygon)
 * Format: 0x[a-fA-F0-9]{40}
 */
export const EvmAddressSchema = z
    .string()
    .min(42)
    .max(42)
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address format');

/**
 * Recipient address - EVM only (Base blockchain)
 * @deprecated LtoAddressSchema removed - LTO network no longer exists
 */
export const RecipientAddressSchema = EvmAddressSchema;

// ============================================================
// Network Schemas
// ============================================================

/**
 * Network type for Base blockchain
 * mainnet = Base Mainnet (chainId: 8453)
 * testnet = Base Sepolia (chainId: 84532)
 */
export const NetworkTypeSchema = z.enum(['mainnet', 'testnet']);

/**
 * Legacy network ID mapping for backwards compatibility
 * L = mainnet, T = testnet
 * @deprecated Use NetworkTypeSchema instead
 */
export const LegacyNetworkIdSchema = z.enum(['L', 'T']);

/**
 * Supported EVM chains
 */
export const EvmChainSchema = z.enum([
    'ethereum',
    'arbitrum',
    'polygon',
    'base',
]);

// ============================================================
// Transaction Schemas
// ============================================================

/**
 * EVM Transaction hash
 * Format: 0x[a-fA-F0-9]{64}
 */
export const EvmTransactionHashSchema = z
    .string()
    .min(66)
    .max(66)
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid EVM transaction hash format');

/**
 * Transaction ID - can be EVM hash or legacy format
 */
export const TransactionIdSchema = z.union([
    EvmTransactionHashSchema,
    z.string().min(40).max(50).regex(/^[A-Za-z0-9]+$/, 'Invalid transaction ID format'),
]);

// ============================================================
// Ownable Schemas
// ============================================================

/**
 * Template ID for ownables
 * Must be a positive integer within valid range
 */
export const TemplateIdSchema = z
    .number()
    .int()
    .min(1)
    .max(1000);

/**
 * Queue request for creating a new ownable
 */
export const QueueOwnableRequestSchema = z.object({
    templateId: TemplateIdSchema,
    recipient: RecipientAddressSchema,
    networkType: NetworkTypeSchema.optional().default('testnet'),
    chain: EvmChainSchema.optional().default('base'),
    transactionId: TransactionIdSchema,
    metadata: z.record(z.unknown()).optional(),
});

/**
 * Upload ownable ZIP request
 */
export const UploadOwnableRequestSchema = z.object({
    receiver: RecipientAddressSchema,
    templateId: TemplateIdSchema,
    transactionId: TransactionIdSchema,
    networkType: NetworkTypeSchema.optional().default('testnet'),
    chain: EvmChainSchema.optional().default('base'),
});

// ============================================================
// NFT Schemas
// ============================================================

/**
 * NFT minting request
 */
export const MintNftRequestSchema = z.object({
    tokenUri: z.string().url(),
    recipient: EvmAddressSchema,
    chain: EvmChainSchema,
});

/**
 * IPFS CID validation
 * Supports both CIDv0 (Qm...) and CIDv1 (bafy...)
 */
export const IpfsCidSchema = z
    .string()
    .min(46)
    .max(64)
    .regex(/^(Qm[A-Za-z0-9]{44}|bafy[A-Za-z0-9]{55})$/, 'Invalid IPFS CID format');

// ============================================================
// Type Exports
// ============================================================

export type EvmAddress = z.infer<typeof EvmAddressSchema>;
export type RecipientAddress = z.infer<typeof RecipientAddressSchema>;
export type NetworkType = z.infer<typeof NetworkTypeSchema>;
export type LegacyNetworkId = z.infer<typeof LegacyNetworkIdSchema>;
export type EvmChain = z.infer<typeof EvmChainSchema>;
export type EvmTransactionHash = z.infer<typeof EvmTransactionHashSchema>;
export type TransactionId = z.infer<typeof TransactionIdSchema>;
export type TemplateId = z.infer<typeof TemplateIdSchema>;
export type QueueOwnableRequest = z.infer<typeof QueueOwnableRequestSchema>;
export type UploadOwnableRequest = z.infer<typeof UploadOwnableRequestSchema>;
export type MintNftRequest = z.infer<typeof MintNftRequestSchema>;
export type IpfsCid = z.infer<typeof IpfsCidSchema>;

// Legacy type aliases for backwards compatibility
/** @deprecated Use EvmAddress instead */
export type LtoAddress = EvmAddress;
/** @deprecated Use LegacyNetworkId instead */
export type LtoNetworkId = LegacyNetworkId;
/** @deprecated Use TransactionId instead */
export type LtoTransactionId = TransactionId;

// ============================================================
// Validation Helpers
// ============================================================

/**
 * Validate and parse input, throwing ZodError on failure
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 */
export function validateSafe<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}

/**
 * Convert legacy network ID to network type
 */
export function legacyNetworkIdToType(networkId: LegacyNetworkId): NetworkType {
    return networkId === 'L' ? 'mainnet' : 'testnet';
}

/**
 * Convert network type to legacy network ID
 */
export function networkTypeToLegacyId(networkType: NetworkType): LegacyNetworkId {
    return networkType === 'mainnet' ? 'L' : 'T';
}

// ============================================================
// Unified Network ID (Supports Both Formats)
// ============================================================

/**
 * Unified network ID that accepts both legacy ('L'|'T') and modern ('mainnet'|'testnet') formats
 */
export type NetworkId = LegacyNetworkId | NetworkType;

/**
 * Unified schema for any network ID format
 */
export const NetworkIdSchema = z.union([LegacyNetworkIdSchema, NetworkTypeSchema]);

/**
 * Normalize any network ID to the modern format
 * Accepts: 'L', 'T', 'mainnet', 'testnet'
 * Returns: 'mainnet' | 'testnet'
 */
export function normalizeNetworkId(networkId: NetworkId): NetworkType {
    if (networkId === 'L' || networkId === 'mainnet') {
        return 'mainnet';
    }
    return 'testnet';
}

/**
 * Convert any network ID to legacy format
 * Accepts: 'L', 'T', 'mainnet', 'testnet'
 * Returns: 'L' | 'T'
 */
export function toLegacyNetworkId(networkId: NetworkId): LegacyNetworkId {
    if (networkId === 'L' || networkId === 'mainnet') {
        return 'L';
    }
    return 'T';
}
