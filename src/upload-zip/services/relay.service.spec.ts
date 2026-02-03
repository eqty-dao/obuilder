import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OwnableRelayService } from './relay.service';
import { ConfigService } from '../../config/config.service';
import { EqtyService } from '../../eqty/eqty.service';
import { LoggingService } from '../../logging/logging.service';
import { QueueService } from '../../queue/queue.service';

// Mock fetch
global.fetch = vi.fn();

describe('OwnableRelayService', () => {
    let service: OwnableRelayService;
    let mockConfig: Partial<ConfigService>;
    let mockEqtyService: Partial<EqtyService>;
    let mockLoggingService: Partial<LoggingService>;
    let mockQueueService: Partial<QueueService>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockConfig = {
            get: vi.fn().mockImplementation((key: string) => {
                if (key === 'eqty.relayUrl') return 'https://relay.test.io';
                return null;
            }),
        };

        mockEqtyService = {
            isValidAddress: vi.fn().mockReturnValue(true),
            getAddress: vi.fn().mockReturnValue('0xSenderAddress'),
            createAndSendMessage: vi.fn().mockResolvedValue({
                message: {},
                hash: 'test-hash-123',
            }),
        };

        mockLoggingService = {
            log: vi.fn(),
            logError: vi.fn(),
        };

        mockQueueService = {
            setQueueEntryStatus: vi.fn().mockResolvedValue(undefined),
        };

        service = new OwnableRelayService(
            mockConfig as ConfigService,
            mockEqtyService as EqtyService,
            mockLoggingService as LoggingService,
            mockQueueService as QueueService,
        );
    });

    describe('getRelayUrl', () => {
        it('should return configured relay URL', () => {
            const result = service.getRelayUrl();
            expect(result).toBe('https://relay.test.io');
        });

        it('should return default URL when not configured', () => {
            mockConfig.get = vi.fn().mockReturnValue(null);
            const result = service.getRelayUrl();
            expect(result).toBe('https://relay.eqty.io');
        });
    });

    describe('isRelayUp', () => {
        it('should return true when relay responds with ok', async () => {
            (global.fetch as any).mockResolvedValue({ ok: true });

            const result = await service.isRelayUp('https://relay.test.io');

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith('https://relay.test.io', { method: 'HEAD' });
        });

        it('should return false when relay responds with not ok', async () => {
            (global.fetch as any).mockResolvedValue({ ok: false });

            const result = await service.isRelayUp('https://relay.test.io');

            expect(result).toBe(false);
        });

        it('should throw when url is undefined', async () => {
            await expect(service.isRelayUp(undefined)).rejects.toThrow('Undefined relay URL');
        });

        it('should throw when fetch fails', async () => {
            (global.fetch as any).mockRejectedValue(new Error('Network error'));

            await expect(service.isRelayUp('https://relay.test.io')).rejects.toThrow('Relay Server');
        });
    });

    describe('isRelayServerUp', () => {
        it('should return success message when relay is up', async () => {
            (global.fetch as any).mockResolvedValue({ ok: true });

            const result = await service.isRelayServerUp();

            expect(result).toContain('SUCCESS');
        });
    });

    describe('sendOwnableBase', () => {
        const validContent = new Uint8Array([1, 2, 3]);
        const validRecipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

        it('should send ownable successfully', async () => {
            await service.sendOwnableBase('testnet', 'req-123', validRecipient, validContent);

            expect(mockEqtyService.isValidAddress).toHaveBeenCalledWith(validRecipient);
            expect(mockEqtyService.createAndSendMessage).toHaveBeenCalledWith(
                validContent,
                validRecipient,
                'testnet',
                'https://relay.test.io',
                'application/octet-stream',
            );
            expect(mockQueueService.setQueueEntryStatus).toHaveBeenCalled();
        });

        it('should throw when recipient address is invalid', async () => {
            (mockEqtyService.isValidAddress as any).mockReturnValue(false);

            await expect(
                service.sendOwnableBase('testnet', 'req-123', 'invalid-address', validContent),
            ).rejects.toThrow('Invalid Ethereum address');
        });

        it('should throw when content is not provided', async () => {
            await expect(
                service.sendOwnableBase('testnet', 'req-123', validRecipient, undefined),
            ).rejects.toThrow('No content provided');
        });

        it('should use L network ID for mainnet queue status', async () => {
            await service.sendOwnableBase('mainnet', 'req-123', validRecipient, validContent);

            expect(mockQueueService.setQueueEntryStatus).toHaveBeenCalledWith(
                'L',
                'req-123',
                expect.anything(),
                'test-hash-123',
            );
        });

        it('should use T network ID for testnet queue status', async () => {
            await service.sendOwnableBase('testnet', 'req-123', validRecipient, validContent);

            expect(mockQueueService.setQueueEntryStatus).toHaveBeenCalledWith(
                'T',
                'req-123',
                expect.anything(),
                'test-hash-123',
            );
        });
    });

    describe('sendOwnable (deprecated)', () => {
        it('should delegate to sendOwnableBase with mainnet for L', async () => {
            const content = new Uint8Array([1, 2, 3]);
            const recipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

            await service.sendOwnable('L', 'req-123', recipient, content);

            expect(mockEqtyService.createAndSendMessage).toHaveBeenCalledWith(
                content,
                recipient,
                'mainnet',
                expect.any(String),
                'application/octet-stream',
            );
        });
    });
});
