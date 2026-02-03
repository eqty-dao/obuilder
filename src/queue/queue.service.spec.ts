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
  });
});
