/**
 * Network Errors
 * 
 * Errors related to external service failures.
 * These are typically 5xx errors indicating infrastructure issues.
 */

import { OBuilderError } from './base.error';

/**
 * LTO Relay server unreachable
 */
export class RelayUnreachableError extends OBuilderError {
    readonly _tag = 'RelayUnreachableError' as const;
    readonly httpStatus = 503;
    readonly code = 'RELAY_UNREACHABLE';

    constructor(cause?: unknown) {
        super('LTO Relay server is unreachable', cause);
    }
}

/**
 * LTO Node unreachable
 */
export class LtoNodeUnreachableError extends OBuilderError {
    readonly _tag = 'LtoNodeUnreachableError' as const;
    readonly httpStatus = 503;
    readonly code = 'LTO_NODE_UNREACHABLE';

    constructor(nodeUrl: string, cause?: unknown) {
        super(`LTO Node at ${nodeUrl} is unreachable`, cause);
    }
}

/**
 * IPFS/Pinata pinning failed
 */
export class IPFSPinningError extends OBuilderError {
    readonly _tag = 'IPFSPinningError' as const;
    readonly httpStatus = 502;
    readonly code = 'IPFS_PINNING_FAILED';

    constructor(reason: string, cause?: unknown) {
        super(`IPFS pinning failed: ${reason}`, cause);
    }
}

/**
 * IPFS gateway unreachable
 */
export class IPFSGatewayError extends OBuilderError {
    readonly _tag = 'IPFSGatewayError' as const;
    readonly httpStatus = 503;
    readonly code = 'IPFS_GATEWAY_UNREACHABLE';

    constructor(gatewayUrl: string, cause?: unknown) {
        super(`IPFS gateway at ${gatewayUrl} is unreachable`, cause);
    }
}

/**
 * EVM RPC unreachable
 */
export class EvmRpcUnreachableError extends OBuilderError {
    readonly _tag = 'EvmRpcUnreachableError' as const;
    readonly httpStatus = 503;
    readonly code = 'EVM_RPC_UNREACHABLE';

    constructor(chain: string, cause?: unknown) {
        super(`EVM RPC for ${chain} is unreachable`, cause);
    }
}

/**
 * Blockchain anchoring failed
 */
export class AnchoringError extends OBuilderError {
    readonly _tag = 'AnchoringError' as const;
    readonly httpStatus = 502;
    readonly code = 'ANCHORING_FAILED';

    constructor(reason: string, cause?: unknown) {
        super(`Blockchain anchoring failed: ${reason}`, cause);
    }
}

/**
 * NFT minting failed
 */
export class MintingError extends OBuilderError {
    readonly _tag = 'MintingError' as const;
    readonly httpStatus = 502;
    readonly code = 'MINTING_FAILED';

    constructor(chain: string, reason: string, cause?: unknown) {
        super(`NFT minting on ${chain} failed: ${reason}`, cause);
    }
}

/**
 * S3 storage error
 */
export class S3StorageError extends OBuilderError {
    readonly _tag = 'S3StorageError' as const;
    readonly httpStatus = 503;
    readonly code = 'S3_STORAGE_ERROR';

    constructor(operation: 'upload' | 'download' | 'delete', cause?: unknown) {
        super(`S3 ${operation} operation failed`, cause);
    }
}

/**
 * Rate limit exceeded (external service)
 */
export class ExternalRateLimitError extends OBuilderError {
    readonly _tag = 'ExternalRateLimitError' as const;
    readonly httpStatus = 503;
    readonly code = 'EXTERNAL_RATE_LIMIT';

    constructor(service: string, retryAfter?: number) {
        super(
            retryAfter
                ? `${service} rate limit exceeded. Retry after ${retryAfter}s`
                : `${service} rate limit exceeded`,
        );
    }
}

/**
 * Service timeout error
 */
export class ServiceTimeoutError extends OBuilderError {
    readonly _tag = 'ServiceTimeoutError' as const;
    readonly httpStatus = 504;
    readonly code = 'SERVICE_TIMEOUT';

    constructor(service: string, timeoutMs: number) {
        super(`${service} request timed out after ${timeoutMs}ms`);
    }
}
