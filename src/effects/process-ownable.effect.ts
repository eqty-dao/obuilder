/**
 * Effect-TS Pipeline for Ownable Processing
 * 
 * This module provides a functional, type-safe pipeline for processing ownables.
 * Each step in the pipeline has typed errors that are tracked at compile time.
 * 
 * Benefits:
 * - Composable: Each step can be tested independently
 * - Type-safe errors: Compiler knows exactly which errors can occur
 * - Retry/recovery: Built-in retry and fallback mechanisms
 * - Observability: Easy to add logging/tracing at each step
 */
import { Effect, pipe } from 'effect';

/**
 * Error types for the ownable processing pipeline
 */
export class IPFSError {
    readonly _tag = 'IPFSError';
    constructor(readonly message: string, readonly cause?: unknown) { }
}

export class EventChainError {
    readonly _tag = 'EventChainError';
    constructor(readonly message: string, readonly cause?: unknown) { }
}

export class AnchorError {
    readonly _tag = 'AnchorError';
    constructor(readonly message: string, readonly cause?: unknown) { }
}

export class ValidationError {
    readonly _tag = 'ValidationError';
    constructor(readonly message: string, readonly field?: string) { }
}

/**
 * Result types
 */
export interface OwnableResult {
    ipfsHash: string;
    eventChainId: string;
    anchorTxHash: string;
}

export interface OwnableInput {
    file: Buffer;
    metadata: {
        name: string;
        description?: string;
        ownerAddress: string;
    };
}

/**
 * Upload file to IPFS
 * Returns an Effect that either succeeds with the IPFS hash or fails with IPFSError
 */
export const uploadToIPFS = (
    file: Buffer,
    pinataService: { pinFile: (file: Buffer) => Promise<string> }
): Effect.Effect<string, IPFSError> =>
    Effect.tryPromise({
        try: () => pinataService.pinFile(file),
        catch: (error) => new IPFSError('Failed to upload to IPFS', error),
    });

/**
 * Create an event chain for the ownable
 */
export const createEventChain = (
    ipfsHash: string,
    eqtyService: { createChain: (hash: string) => Promise<string> }
): Effect.Effect<string, EventChainError> =>
    Effect.tryPromise({
        try: () => eqtyService.createChain(ipfsHash),
        catch: (error) => new EventChainError('Failed to create event chain', error),
    });

/**
 * Anchor the event chain to Base blockchain
 */
export const anchorToBase = (
    eventChainId: string,
    anchorService: { anchor: (chainId: string) => Promise<string> }
): Effect.Effect<string, AnchorError> =>
    Effect.tryPromise({
        try: () => anchorService.anchor(eventChainId),
        catch: (error) => new AnchorError('Failed to anchor to Base', error),
    });

/**
 * Complete ownable processing pipeline
 * 
 * This function composes all the steps into a single Effect that:
 * 1. Uploads file to IPFS
 * 2. Creates an event chain
 * 3. Anchors to Base blockchain
 * 
 * All errors are typed and can be handled individually or as a group.
 */
export const processOwnable = (
    input: OwnableInput,
    services: {
        pinata: { pinFile: (file: Buffer) => Promise<string> };
        eqty: { createChain: (hash: string) => Promise<string> };
        anchor: { anchor: (chainId: string) => Promise<string> };
    }
): Effect.Effect<OwnableResult, IPFSError | EventChainError | AnchorError> =>
    pipe(
        // Step 1: Upload to IPFS
        uploadToIPFS(input.file, services.pinata),

        // Step 2: Create event chain with the IPFS hash
        Effect.flatMap((ipfsHash) =>
            pipe(
                createEventChain(ipfsHash, services.eqty),
                Effect.map((eventChainId) => ({ ipfsHash, eventChainId }))
            )
        ),

        // Step 3: Anchor to Base
        Effect.flatMap(({ ipfsHash, eventChainId }) =>
            pipe(
                anchorToBase(eventChainId, services.anchor),
                Effect.map((anchorTxHash) => ({
                    ipfsHash,
                    eventChainId,
                    anchorTxHash,
                }))
            )
        )
    );

/**
 * Run the Effect and convert to Promise for NestJS compatibility
 */
export const runProcessOwnable = async (
    input: OwnableInput,
    services: {
        pinata: { pinFile: (file: Buffer) => Promise<string> };
        eqty: { createChain: (hash: string) => Promise<string> };
        anchor: { anchor: (chainId: string) => Promise<string> };
    }
): Promise<OwnableResult> => {
    return Effect.runPromise(processOwnable(input, services));
};
