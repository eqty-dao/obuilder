import { describe, it, expect, vi } from 'vitest';
import { Effect, Exit, Cause } from 'effect';
import {
    IPFSError,
    EventChainError,
    AnchorError,
    ValidationError,
    uploadToIPFS,
    createEventChain,
    anchorToBase,
    processOwnable,
    runProcessOwnable,
    OwnableInput,
} from './process-ownable.effect';

// Helper to extract the error from Effect
const runAndGetError = async <A, E>(effect: Effect.Effect<A, E>): Promise<E | null> => {
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isFailure(exit)) {
        const cause = exit.cause;
        if (Cause.isFailType(cause)) {
            return cause.error;
        }
    }
    return null;
};

describe('process-ownable.effect', () => {
    describe('Error Classes', () => {
        it('should create IPFSError with message', () => {
            const error = new IPFSError('Upload failed');
            expect(error._tag).toBe('IPFSError');
            expect(error.message).toBe('Upload failed');
        });

        it('should create IPFSError with cause', () => {
            const cause = new Error('Network error');
            const error = new IPFSError('Upload failed', cause);
            expect(error.cause).toBe(cause);
        });

        it('should create EventChainError with message', () => {
            const error = new EventChainError('Chain creation failed');
            expect(error._tag).toBe('EventChainError');
            expect(error.message).toBe('Chain creation failed');
        });

        it('should create EventChainError with cause', () => {
            const cause = new Error('Service unavailable');
            const error = new EventChainError('Chain creation failed', cause);
            expect(error.cause).toBe(cause);
        });

        it('should create AnchorError with message', () => {
            const error = new AnchorError('Anchor failed');
            expect(error._tag).toBe('AnchorError');
            expect(error.message).toBe('Anchor failed');
        });

        it('should create AnchorError with cause', () => {
            const cause = new Error('Blockchain error');
            const error = new AnchorError('Anchor failed', cause);
            expect(error.cause).toBe(cause);
        });

        it('should create ValidationError with message', () => {
            const error = new ValidationError('Invalid input');
            expect(error._tag).toBe('ValidationError');
            expect(error.message).toBe('Invalid input');
        });

        it('should create ValidationError with field', () => {
            const error = new ValidationError('Invalid input', 'email');
            expect(error.field).toBe('email');
        });
    });

    describe('uploadToIPFS', () => {
        it('should succeed when pinFile succeeds', async () => {
            const mockPinata = {
                pinFile: vi.fn().mockResolvedValue('QmHash123'),
            };
            const file = Buffer.from('test content');

            const effect = uploadToIPFS(file, mockPinata);
            const result = await Effect.runPromise(effect);

            expect(result).toBe('QmHash123');
            expect(mockPinata.pinFile).toHaveBeenCalledWith(file);
        });

        it('should fail with IPFSError when pinFile fails', async () => {
            const mockPinata = {
                pinFile: vi.fn().mockRejectedValue(new Error('Network error')),
            };
            const file = Buffer.from('test content');

            const effect = uploadToIPFS(file, mockPinata);
            const error = await runAndGetError(effect);

            expect(error).not.toBeNull();
            expect(error!._tag).toBe('IPFSError');
            expect(error!.message).toBe('Failed to upload to IPFS');
        });
    });

    describe('createEventChain', () => {
        it('should succeed when createChain succeeds', async () => {
            const mockEqty = {
                createChain: vi.fn().mockResolvedValue('chain-id-123'),
            };

            const effect = createEventChain('QmHash123', mockEqty);
            const result = await Effect.runPromise(effect);

            expect(result).toBe('chain-id-123');
            expect(mockEqty.createChain).toHaveBeenCalledWith('QmHash123');
        });

        it('should fail with EventChainError when createChain fails', async () => {
            const mockEqty = {
                createChain: vi.fn().mockRejectedValue(new Error('Service error')),
            };

            const effect = createEventChain('QmHash123', mockEqty);
            const error = await runAndGetError(effect);

            expect(error).not.toBeNull();
            expect(error!._tag).toBe('EventChainError');
            expect(error!.message).toBe('Failed to create event chain');
        });
    });

    describe('anchorToBase', () => {
        it('should succeed when anchor succeeds', async () => {
            const mockAnchor = {
                anchor: vi.fn().mockResolvedValue('0xTxHash123'),
            };

            const effect = anchorToBase('chain-id-123', mockAnchor);
            const result = await Effect.runPromise(effect);

            expect(result).toBe('0xTxHash123');
            expect(mockAnchor.anchor).toHaveBeenCalledWith('chain-id-123');
        });

        it('should fail with AnchorError when anchor fails', async () => {
            const mockAnchor = {
                anchor: vi.fn().mockRejectedValue(new Error('Blockchain error')),
            };

            const effect = anchorToBase('chain-id-123', mockAnchor);
            const error = await runAndGetError(effect);

            expect(error).not.toBeNull();
            expect(error!._tag).toBe('AnchorError');
            expect(error!.message).toBe('Failed to anchor to Base');
        });
    });

    describe('processOwnable', () => {
        const createMockServices = () => ({
            pinata: { pinFile: vi.fn().mockResolvedValue('QmHash123') },
            eqty: { createChain: vi.fn().mockResolvedValue('chain-id-123') },
            anchor: { anchor: vi.fn().mockResolvedValue('0xTxHash123') },
        });

        const createInput = (): OwnableInput => ({
            file: Buffer.from('test content'),
            metadata: {
                name: 'Test Ownable',
                description: 'A test ownable',
                ownerAddress: '0x123456',
            },
        });

        it('should complete full pipeline successfully', async () => {
            const services = createMockServices();
            const input = createInput();

            const effect = processOwnable(input, services);
            const result = await Effect.runPromise(effect);

            expect(result).toEqual({
                ipfsHash: 'QmHash123',
                eventChainId: 'chain-id-123',
                anchorTxHash: '0xTxHash123',
            });
        });

        it('should call services in correct order', async () => {
            const services = createMockServices();
            const input = createInput();

            await Effect.runPromise(processOwnable(input, services));

            expect(services.pinata.pinFile).toHaveBeenCalledWith(input.file);
            expect(services.eqty.createChain).toHaveBeenCalledWith('QmHash123');
            expect(services.anchor.anchor).toHaveBeenCalledWith('chain-id-123');
        });

        it('should fail with IPFSError when upload fails', async () => {
            const services = createMockServices();
            services.pinata.pinFile.mockRejectedValue(new Error('IPFS down'));
            const input = createInput();

            const effect = processOwnable(input, services);
            const error = await runAndGetError(effect);

            expect(error).not.toBeNull();
            expect(error!._tag).toBe('IPFSError');
        });

        it('should fail with EventChainError when chain creation fails', async () => {
            const services = createMockServices();
            services.eqty.createChain.mockRejectedValue(new Error('Chain error'));
            const input = createInput();

            const effect = processOwnable(input, services);
            const error = await runAndGetError(effect);

            expect(error).not.toBeNull();
            expect(error!._tag).toBe('EventChainError');
        });

        it('should fail with AnchorError when anchoring fails', async () => {
            const services = createMockServices();
            services.anchor.anchor.mockRejectedValue(new Error('Anchor error'));
            const input = createInput();

            const effect = processOwnable(input, services);
            const error = await runAndGetError(effect);

            expect(error).not.toBeNull();
            expect(error!._tag).toBe('AnchorError');
        });
    });

    describe('runProcessOwnable', () => {
        it('should return result as Promise', async () => {
            const services = {
                pinata: { pinFile: vi.fn().mockResolvedValue('QmHash123') },
                eqty: { createChain: vi.fn().mockResolvedValue('chain-id-123') },
                anchor: { anchor: vi.fn().mockResolvedValue('0xTxHash123') },
            };
            const input: OwnableInput = {
                file: Buffer.from('test'),
                metadata: { name: 'Test', ownerAddress: '0x123' },
            };

            const result = await runProcessOwnable(input, services);

            expect(result).toEqual({
                ipfsHash: 'QmHash123',
                eventChainId: 'chain-id-123',
                anchorTxHash: '0xTxHash123',
            });
        });

        it('should reject Promise when pipeline fails', async () => {
            const services = {
                pinata: { pinFile: vi.fn().mockRejectedValue(new Error('fail')) },
                eqty: { createChain: vi.fn() },
                anchor: { anchor: vi.fn() },
            };
            const input: OwnableInput = {
                file: Buffer.from('test'),
                metadata: { name: 'Test', ownerAddress: '0x123' },
            };

            await expect(runProcessOwnable(input, services)).rejects.toBeDefined();
        });
    });
});
