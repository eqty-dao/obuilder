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
});
