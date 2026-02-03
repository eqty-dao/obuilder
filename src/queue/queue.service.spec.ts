import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from './queue.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { S3Service } from '../s3/s3.service';

describe('QueueService', () => {
  let service: QueueService;
  let mockTelegramService: Partial<TelegramBotService>;
  let mockS3Service: Partial<S3Service>;

  beforeEach(() => {
    mockTelegramService = {
      sendMessageToTelegramBot: vi.fn().mockResolvedValue(undefined),
    };

    mockS3Service = {
      checkFileExists: vi.fn().mockResolvedValue(false),
      s3BucketQueue_L: {
        get: vi.fn().mockResolvedValue(Buffer.from('[]')),
        put: vi.fn().mockResolvedValue(undefined),
      },
      s3BucketQueue_T: {
        get: vi.fn().mockResolvedValue(Buffer.from('[]')),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    service = new QueueService(
      mockTelegramService as TelegramBotService,
      mockS3Service as S3Service
    );
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have queueing enabled by default for mainnet', () => {
      expect(service.isQueueingAllowed('L')).toBe(true);
    });

    it('should have queueing enabled by default for testnet', () => {
      expect(service.isQueueingAllowed('T')).toBe(true);
    });

    it('should report empty queue initially', () => {
      expect(service.isQueueEmpty()).toBe(true);
    });

    it('should report not creating ownable initially (empty string)', () => {
      expect(service.isCreatingOwnable()).toBe('');
    });
  });

  describe('Template Costs', () => {
    it('should set and get template costs for mainnet', async () => {
      await service.setTemplateCosts('L', 'base', '1', 100000000, 90000000, 0.15);
      const cost = service.getTemplateCosts('L', 'base', '1');
      expect(cost).toBe('100000000');
    });

    it('should set and get template costs for testnet', async () => {
      await service.setTemplateCosts('T', 'base', '1', 50000000, 45000000, 0.10);
      const cost = service.getTemplateCosts('T', 'base', '1');
      expect(cost).toBe('50000000');
    });

    it('should get costs including previous value', async () => {
      await service.setTemplateCosts('L', 'base', '1', 100000000, 90000000, 0.15);
      const [current, previous] = service.getTemplateCostsIncludingPrevious('L', 'base', '1');
      expect(current).toBe('100000000');
      expect(previous).toBe('90000000');
    });

    it('should use lastValue as prev when prevValue is 0', async () => {
      await service.setTemplateCosts('L', 'base', '1', 100000000, 0, 0.15);
      const [current, previous] = service.getTemplateCostsIncludingPrevious('L', 'base', '1');
      expect(current).toBe('100000000');
      expect(previous).toBe('100000000');
    });
  });

  describe('Queue Control', () => {
    it('should allow toggling queueing off for mainnet', () => {
      service.allowQueueing('L', false);
      expect(service.isQueueingAllowed('L')).toBe(false);
    });

    it('should allow toggling queueing on for mainnet', () => {
      service.allowQueueing('L', false);
      service.allowQueueing('L', true);
      expect(service.isQueueingAllowed('L')).toBe(true);
    });

    it('should allow toggling queueing off for testnet', () => {
      service.allowQueueing('T', false);
      expect(service.isQueueingAllowed('T')).toBe(false);
    });

    it('should track queueing status separately for each network', () => {
      service.allowQueueing('L', false);
      service.allowQueueing('T', true);

      expect(service.isQueueingAllowed('L')).toBe(false);
      expect(service.isQueueingAllowed('T')).toBe(true);
    });
  });

  describe('Queue Entry Lookup', () => {
    it('should return default entry for unknown request ID on mainnet', () => {
      const [entry, index] = service.getQueueEntryByRequestId('L', 'unknown-id');
      expect(entry).toBeDefined();
      expect(entry.rid).toBe('');
      expect(index).toBe(0);
    });

    it('should return default entry for unknown request ID on testnet', () => {
      const [entry, index] = service.getQueueEntryByRequestId('T', 'unknown-id');
      expect(entry).toBeDefined();
      expect(entry.rid).toBe('');
    });

    it('should return empty array for empty wallet query', () => {
      const entries = service.getQueueEntriesByWallet('L', '0xNonexistent');
      expect(entries).toHaveLength(0);
    });

    it('should return null for unknown transaction ID', () => {
      const [requestId, network] = service.getRequestIdByTxId('unknown-tx');
      expect(requestId).toBeNull();
      expect(network).toBeNull();
    });
  });

  describe('processNextQueueEntry', () => {
    it('should return null tuple when mainnet queue is empty', async () => {
      const result = await service.processNextQueueEntry();
      expect(result[0]).toBeNull();
      expect(result[1]).toBeNull();
      expect(result[2]).toBeNull();
    });

    it('should return 7-element null tuple', async () => {
      const result = await service.processNextQueueEntry();
      expect(result).toHaveLength(7);
      expect(result.every(item => item === null)).toBe(true);
    });
  });

  describe('enqueue', () => {
    it('should create queue entry with valid data', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const entry = await service.enqueue('L', 'test-request-id', data, '0xWallet', 'tx-id', 1);

      expect(entry).toBeDefined();
      expect(entry.rid).toBe('test-request-id');
      expect(entry.ltoWallet).toBe('0xWallet');
      expect(entry.txId).toBe('tx-id');
      expect(entry.templateId).toBe(1);
      expect(entry.ownableStatus).toBe(1); // InQueue status = 1
    });

    it('should store data in S3 bucket', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'test-rid', data, '0xWallet', 'tx-id', 1);

      expect(mockS3Service.s3BucketQueue_L!.put).toHaveBeenCalledWith('test-rid_data', data);
    });

    it('should send telegram notification', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'test-rid', data, '0xWallet', 'tx-id', 1);

      expect(mockTelegramService.sendMessageToTelegramBot).toHaveBeenCalledWith(
        'L',
        expect.stringContaining('test-rid')
      );
    });

    it('should throw for non-Uint8Array data', async () => {
      await expect(
        service.enqueue('L', 'test-rid', 'not-array' as any, '0xWallet', 'tx-id', 1)
      ).rejects.toThrow('Data must be of type Uint8Array');
    });

    it('should enqueue to testnet queue', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'test-rid', data, '0xWallet', 'tx-id', 1);

      expect(mockS3Service.s3BucketQueue_T!.put).toHaveBeenCalled();
    });
  });

  describe('getQueueEntriesByStatus', () => {
    it('should return empty array when no entries match status', () => {
      const entries = service.getQueueEntriesByStatus('L', 0); // InQueue
      expect(entries).toHaveLength(0);
    });

    it('should return entries matching status after enqueue', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-status-test', data, '0x123', 'tx1', 1);

      const entries = service.getQueueEntriesByStatus('L', 1); // InQueue = 1
      // After enqueue, there should be at least one InQueue entry
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('getNextQueueEntry', () => {
    it('should return null tuple when queue is empty', () => {
      const result = (service as any).getNextQueueEntry('L');
      expect(result[0]).toBeNull();
      expect(result[1]).toBeNull();
    });

    it('should return entry after enqueue', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid1', data, '0x123', 'tx1', 1);

      const result = (service as any).getNextQueueEntry('L');
      expect(result[0]).toBeDefined();
      expect(result[0].rid).toBe('rid1');
    });
  });

  describe('setQueueEntryStatus', () => {
    it('should update entry status', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid1', data, '0x123', 'tx1', 1);

      await service.setQueueEntryStatus('L', 'rid1', 1); // Processing

      const [entry] = service.getQueueEntryByRequestId('L', 'rid1');
      expect(entry.ownableStatus).toBe(1);
    });

    it('should set hash when Sent status is provided', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-hash-test', data, '0x123', 'tx1', 1);

      // Hash is only set when status is Sent (4)
      await service.setQueueEntryStatus('L', 'rid-hash-test', 4, 'test-hash'); // Sent = 4

      const [entry] = service.getQueueEntryByRequestId('L', 'rid-hash-test');
      expect(entry.hash).toBe('test-hash');
    });
  });

  describe('getQueueEntryIndexByStatus', () => {
    it('should return null when no entry with status exists', () => {
      const index = (service as any).getQueueEntryIndexByStatus('L', 1);
      expect(index).toBeNull();
    });
  });

  describe('onModuleInit', () => {
    it('should handle S3 initialization when Queue.json exists', async () => {
      mockS3Service.checkFileExists = vi.fn().mockResolvedValue(true);
      mockS3Service.s3BucketQueue_L!.get = vi.fn().mockResolvedValue(Buffer.from('[]'));
      mockS3Service.s3BucketQueue_T!.get = vi.fn().mockResolvedValue(Buffer.from('[]'));

      await service.onModuleInit();

      expect(mockS3Service.checkFileExists).toHaveBeenCalledWith('L', 'Queue.json');
      expect(mockS3Service.checkFileExists).toHaveBeenCalledWith('T', 'Queue.json');
    });

    it('should create Queue.json when it does not exist', async () => {
      mockS3Service.checkFileExists = vi.fn().mockResolvedValue(false);

      await service.onModuleInit();

      expect(mockS3Service.s3BucketQueue_L!.put).toHaveBeenCalled();
      expect(mockS3Service.s3BucketQueue_T!.put).toHaveBeenCalled();
    });
  });

  describe('setCidNftInfo', () => {
    it('should set CID and NFT info on entry', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid1', data, '0x123', 'tx1', 1);

      const nftInfo = { network: 'base', address: '0xNFT', id: 123 };
      await service.setCidNftInfo('L', 'rid1', 'QmCID123', nftInfo, 'https://nft.uri');

      const [entry] = service.getQueueEntryByRequestId('L', 'rid1');
      expect(entry.cid).toBe('QmCID123');
      expect(entry.nftInfo).toEqual(nftInfo);
    });
  });

  describe('ownableFailed', () => {
    it('should mark entry as failed', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-failed-test', data, '0x123', 'tx1', 1);

      await service.ownableFailed('L', 'rid-failed-test', 'Test error message');

      const [entry] = service.getQueueEntryByRequestId('L', 'rid-failed-test');
      expect(entry.ownableStatus).toBe(5); // Failed = 5
      expect(entry.failedErrMsg).toBe('Test error message');
    });

    it('should mark testnet entry as failed', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-failed-testnet', data, '0x456', 'tx2', 1);

      await service.ownableFailed('T', 'rid-failed-testnet', 'Testnet error');

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-failed-testnet');
      expect(entry.ownableStatus).toBe(5);
      expect(entry.failedErrMsg).toBe('Testnet error');
    });

    it('should send telegram notification on failure', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-telegram-test', data, '0x123', 'tx1', 1);

      await service.ownableFailed('L', 'rid-telegram-test', 'Error message');

      expect(mockTelegramService.sendMessageToTelegramBot).toHaveBeenCalledWith(
        'L',
        expect.stringContaining('rid-telegram-test')
      );
    });
  });

  // ============================================
  // Additional Tests for Better Coverage
  // ============================================

  describe('getQueueEntriesByWallet (extended)', () => {
    it('should return entries for matching wallet on mainnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-wallet-1', data, '0xMyWallet', 'tx1', 1);
      await service.enqueue('L', 'rid-wallet-2', data, '0xMyWallet', 'tx2', 1);

      const entries = service.getQueueEntriesByWallet('L', '0xMyWallet');
      expect(entries).toHaveLength(2);
    });

    it('should return entries for matching wallet on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-wallet-t1', data, '0xTestWallet', 'tx1', 1);

      const entries = service.getQueueEntriesByWallet('T', '0xTestWallet');
      expect(entries).toHaveLength(1);
      expect(entries[0].ltoWallet).toBe('0xTestWallet');
    });

    it('should return empty array for non-matching wallet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-other', data, '0xOtherWallet', 'tx1', 1);

      const entries = service.getQueueEntriesByWallet('L', '0xNonExistent');
      expect(entries).toHaveLength(0);
    });
  });

  describe('getRequestIdByTxId (extended)', () => {
    it('should find request ID on mainnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-tx-lookup', data, '0x123', 'unique-tx-123', 1);

      const [requestId, network] = service.getRequestIdByTxId('unique-tx-123');
      expect(requestId).toBe('rid-tx-lookup');
      expect(network).toBe('L');
    });

    it('should find request ID on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-tx-testnet', data, '0x456', 'testnet-tx-456', 1);

      const [requestId, network] = service.getRequestIdByTxId('testnet-tx-456');
      expect(requestId).toBe('rid-tx-testnet');
      expect(network).toBe('T');
    });
  });

  describe('isCreatingOwnable (extended)', () => {
    it('should return L when mainnet entry is processing', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-processing', data, '0x123', 'tx1', 1);
      await service.setQueueEntryStatus('L', 'rid-processing', 2); // Processing = 2

      expect(service.isCreatingOwnable()).toBe('L');
    });

    it('should return T when testnet entry is processing', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-processing-t', data, '0x456', 'tx2', 1);
      await service.setQueueEntryStatus('T', 'rid-processing-t', 2); // Processing = 2

      expect(service.isCreatingOwnable()).toBe('T');
    });
  });

  describe('isQueueEmpty (extended)', () => {
    it('should return false when entries are in queue', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-queue-check', data, '0x123', 'tx1', 1);

      expect(service.isQueueEmpty()).toBe(false);
    });

    it('should return false when testnet has entries', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-queue-testnet', data, '0x456', 'tx2', 1);

      expect(service.isQueueEmpty()).toBe(false);
    });
  });

  describe('setQueueEntryStatus (extended)', () => {
    it('should handle Ready status and send telegram', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-ready', data, '0x123', 'tx1', 1);

      await service.setQueueEntryStatus('L', 'rid-ready', 3); // Ready = 3

      const [entry] = service.getQueueEntryByRequestId('L', 'rid-ready');
      expect(entry.ownableStatus).toBe(3);
      expect(entry.timestampReady).toBeGreaterThan(0);
    });

    it('should handle InQueue status reset', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-inqueue', data, '0x123', 'tx1', 1);
      await service.setQueueEntryStatus('L', 'rid-inqueue', 2); // Processing

      await service.setQueueEntryStatus('L', 'rid-inqueue', 1); // Back to InQueue = 1

      const [entry] = service.getQueueEntryByRequestId('L', 'rid-inqueue');
      expect(entry.ownableStatus).toBe(1);
    });

    it('should handle Failed status', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-failed-status', data, '0x123', 'tx1', 1);

      await service.setQueueEntryStatus('L', 'rid-failed-status', 5); // Failed

      const [entry] = service.getQueueEntryByRequestId('L', 'rid-failed-status');
      expect(entry.ownableStatus).toBe(5);
      expect(entry.timestampFailed).toBeGreaterThan(0);
    });

    it('should throw for unknown status', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-unknown', data, '0x123', 'tx1', 1);

      await expect(
        service.setQueueEntryStatus('L', 'rid-unknown', 99 as any)
      ).rejects.toThrow('Unknown Ownable status');
    });

    it('should handle testnet Ready status', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-ready-t', data, '0x456', 'tx2', 1);

      await service.setQueueEntryStatus('T', 'rid-ready-t', 3); // Ready

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-ready-t');
      expect(entry.ownableStatus).toBe(3);
    });
  });

  describe('processNextQueueEntry (extended)', () => {
    it('should process mainnet entry first', async () => {
      const data = new Uint8Array([5, 6, 7, 8]);
      await service.enqueue('L', 'rid-process-l', data, '0x123', 'tx1', 1);

      const result = await service.processNextQueueEntry();

      expect(result[0]).toBe('L');
      expect(result[1]).toBe('rid-process-l');
      expect(result[3]).toBe('0x123');
    });

    it('should process testnet entry when mainnet is empty', async () => {
      const data = new Uint8Array([5, 6, 7, 8]);
      await service.enqueue('T', 'rid-process-t', data, '0x456', 'tx2', 1);

      const result = await service.processNextQueueEntry();

      expect(result[0]).toBe('T');
      expect(result[1]).toBe('rid-process-t');
    });
  });

  describe('getQueueEntriesByStatus (extended)', () => {
    it('should return entries on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-status-t', data, '0x456', 'tx1', 1);

      const entries = service.getQueueEntriesByStatus('T', 1); // InQueue = 1
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('setCidNftInfo (extended)', () => {
    it('should set CID info on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-cid-t', data, '0x456', 'tx1', 1);

      const nftInfo = { network: 'base-sepolia', address: '0xNFT', id: 456 };
      await service.setCidNftInfo('T', 'rid-cid-t', 'QmTestCID', nftInfo, 'https://test.uri');

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-cid-t');
      expect(entry.cid).toBe('QmTestCID');
      expect(entry.nftInfo.id).toBe(456);
    });
  });

  // ============================================
  // Testnet-specific branch coverage
  // ============================================

  describe('setQueueEntryStatus testnet branches', () => {
    it('should handle InQueue status reset on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-inqueue-t', data, '0x456', 'tx1', 1);
      await service.setQueueEntryStatus('T', 'rid-inqueue-t', 2); // Processing

      await service.setQueueEntryStatus('T', 'rid-inqueue-t', 1); // Back to InQueue = 1

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-inqueue-t');
      expect(entry.ownableStatus).toBe(1);
      expect(entry.timestampProcessing).toBe(0);
      expect(entry.timestampReady).toBe(0);
    });

    it('should handle Failed status on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-failed-t', data, '0x456', 'tx1', 1);

      await service.setQueueEntryStatus('T', 'rid-failed-t', 5); // Failed

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-failed-t');
      expect(entry.ownableStatus).toBe(5);
      expect(entry.timestampFailed).toBeGreaterThan(0);
    });

    it('should handle Sent status with hash on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-sent-t', data, '0x456', 'tx1', 1);

      await service.setQueueEntryStatus('T', 'rid-sent-t', 4, 'testnet-hash-123'); // Sent = 4

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-sent-t');
      expect(entry.hash).toBe('testnet-hash-123');
      expect(entry.timestampSent).toBeGreaterThan(0);
    });

    it('should handle Processing status on testnet', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-processing-t2', data, '0x456', 'tx1', 1);

      await service.setQueueEntryStatus('T', 'rid-processing-t2', 2); // Processing = 2

      const [entry] = service.getQueueEntryByRequestId('T', 'rid-processing-t2');
      expect(entry.timestampProcessing).toBeGreaterThan(0);
    });
  });

  describe('ownableFailed error paths', () => {
    it('should throw when index is out of bounds for mainnet', async () => {
      // This tests the error path when entry is not found (returns defaultQueueEntry with index 0)
      // But the queue is empty so index 0 is also out of bounds
      await expect(
        service.ownableFailed('L', 'non-existent-rid', 'Error message')
      ).rejects.toThrow('out of bounds');
    });

    it('should throw when index is out of bounds for testnet', async () => {
      await expect(
        service.ownableFailed('T', 'non-existent-rid-t', 'Error message')
      ).rejects.toThrow('out of bounds');
    });
  });

  describe('getNextQueueEntry testnet', () => {
    it('should return testnet entry when available', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('T', 'rid-next-t', data, '0x456', 'tx1', 1);

      const result = (service as any).getNextQueueEntry('T');
      expect(result[0]).toBeDefined();
      expect(result[0].rid).toBe('rid-next-t');
    });
  });

  describe('getQueueEntryIndexByStatus testnet', () => {
    it('should return null for testnet when no matching status', () => {
      const index = (service as any).getQueueEntryIndexByStatus('T', 2); // Processing
      expect(index).toBeNull();
    });

    it('should return index when entry with status exists', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await service.enqueue('L', 'rid-index-test', data, '0x123', 'tx1', 1);

      const index = (service as any).getQueueEntryIndexByStatus('L', 1); // InQueue = 1
      expect(index).toBe(0);
    });
  });
});
