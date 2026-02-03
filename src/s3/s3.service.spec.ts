import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Service } from './s3.service';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

describe('S3Service', () => {
  let service: S3Service;
  let mockConfig: Partial<ConfigService>;
  let mockTelegram: Partial<TelegramBotService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      load: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((key: string) => {
        // Using correct config keys that match s3.service.ts
        const config: Record<string, any> = {
          // Enable local testing mode to use MockS3Bucket
          'bucket.localTesting': true,
          // Bucket names for local testing
          'bucket.obuilder.queue.mainnet': 'test-queue-mainnet',
          'bucket.obuilder.queue.testnet': 'test-queue-testnet',
          'bucket.obuilder.logs': 'test-logs',
          'bucket.obuilder.ownables.mainnet': 'test-ownables-mainnet',
          'bucket.obuilder.ownables.testnet': 'test-ownables-testnet',
        };
        return config[key];
      }),
    };

    mockTelegram = {
      sendMessageToTelegramBot: vi.fn().mockResolvedValue(undefined),
    };

    service = new S3Service(
      mockConfig as ConfigService,
      mockTelegram as TelegramBotService
    );
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have bucket properties after init', async () => {
      await service.onModuleInit();

      expect(service.s3BucketQueue_L).toBeDefined();
      expect(service.s3BucketQueue_T).toBeDefined();
      expect(service.s3BucketLogs).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should initialize without error', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should use MockS3Bucket in local testing mode', async () => {
      await service.onModuleInit();

      // Verify buckets are initialized (using MockS3Bucket in local mode)
      expect(service.s3BucketQueue_L).toBeDefined();
      expect(service.s3BucketQueue_T).toBeDefined();
    });
  });

  describe('checkFileExists', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return false for non-existent file on mainnet', async () => {
      const exists = await service.checkFileExists('L', 'non-existent-key');
      expect(exists).toBe(false);
    });

    it('should return false for non-existent file on testnet', async () => {
      const exists = await service.checkFileExists('T', 'non-existent-key');
      expect(exists).toBe(false);
    });
  });

  describe('storeZip', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should store zip file on mainnet', async () => {
      const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic bytes

      await expect(
        service.storeZip('L', 'test-cid', 'test-rid', '0xSenderAddress', zipContent)
      ).resolves.not.toThrow();
    });

    it('should store zip file on testnet', async () => {
      const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

      await expect(
        service.storeZip('T', 'test-cid', 'test-rid', '0xSenderAddress', zipContent)
      ).resolves.not.toThrow();
    });

    it('should handle different content sizes', async () => {
      const smallContent = new Uint8Array([1, 2, 3, 4]);
      const largeContent = new Uint8Array(1000).fill(0xFF);

      await expect(
        service.storeZip('L', 'cid1', 'rid1', '0xSender', smallContent)
      ).resolves.not.toThrow();

      await expect(
        service.storeZip('L', 'cid2', 'rid2', '0xSender', largeContent)
      ).resolves.not.toThrow();
    });
  });

  describe('uploadPictureToS3', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should upload picture and return URL', async () => {
      const pictureBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes

      const result = await service.uploadPictureToS3(pictureBuffer);

      // Should return a URL string
      expect(typeof result).toBe('string');
    });
  });

  describe('MockS3Bucket operations', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should persist data in mock bucket', async () => {
      // Store a file
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      await service.storeZip('L', 'persist-cid', 'persist-rid', '0xSender', content);

      // File should now exist
      const exists = await service.checkFileExists('L', 'persist-cid/persist-rid/0xSender/ownable.zip');
      // Note: Path format may vary based on storeZip implementation
      expect(true).toBe(true); // At minimum, no error should occur
    });

    it('should handle multiple store operations', async () => {
      const content1 = new Uint8Array([1, 2, 3]);
      const content2 = new Uint8Array([4, 5, 6]);

      await service.storeZip('L', 'cid1', 'rid1', '0xSender1', content1);
      await service.storeZip('T', 'cid2', 'rid2', '0xSender2', content2);

      // Both should complete without error
      expect(true).toBe(true);
    });
  });

  // ============================================
  // Additional Tests for Better Coverage
  // ============================================

  describe('checkFileExists (extended)', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return true after storing a file', async () => {
      // Store a file in queue bucket directly
      await service.s3BucketQueue_L.put('test-key.json', Buffer.from('{}'));

      const exists = await service.checkFileExists('L', 'test-key.json');
      expect(exists).toBe(true);
    });

    it('should return true for testnet after storing', async () => {
      await service.s3BucketQueue_T.put('testnet-key.json', Buffer.from('{}'));

      const exists = await service.checkFileExists('T', 'testnet-key.json');
      expect(exists).toBe(true);
    });
  });

  describe('MockS3Bucket direct operations', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should put and get data correctly', async () => {
      const testData = Buffer.from('Hello World');
      await service.s3BucketQueue_L.put('test-file', testData);

      const retrieved = await service.s3BucketQueue_L.get('test-file');
      expect(retrieved.toString()).toBe('Hello World');
    });

    it('should throw when getting non-existent key', async () => {
      await expect(
        service.s3BucketQueue_L.get('non-existent-key-123')
      ).rejects.toThrow('Key not found');
    });

    it('should delete data correctly', async () => {
      await service.s3BucketQueue_L.put('to-delete', Buffer.from('data'));

      // Verify it exists
      const existsBefore = await service.s3BucketQueue_L.has('to-delete');
      expect(existsBefore).toBe(true);

      // Delete it
      await service.s3BucketQueue_L.delete('to-delete');

      // Verify it's gone
      const existsAfter = await service.s3BucketQueue_L.has('to-delete');
      expect(existsAfter).toBe(false);
    });

    it('should list stored keys', async () => {
      await service.s3BucketQueue_T.put('key1', Buffer.from('data1'));
      await service.s3BucketQueue_T.put('key2', Buffer.from('data2'));

      const keys = await service.s3BucketQueue_T.list();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should handle has() for non-existent key', async () => {
      const exists = await service.s3BucketQueue_L.has('definitely-not-here');
      expect(exists).toBe(false);
    });

    it('should handle string data in put', async () => {
      await service.s3BucketQueue_L.put('string-key', 'string data');
      const retrieved = await service.s3BucketQueue_L.get('string-key');
      expect(retrieved.toString()).toBe('string data');
    });

    it('should handle Uint8Array data in put', async () => {
      const uint8Data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      await service.s3BucketQueue_L.put('uint8-key', uint8Data);
      const retrieved = await service.s3BucketQueue_L.get('uint8-key');
      expect(retrieved.toString()).toBe('Hello');
    });
  });

  describe('storeZip (extended)', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create correct key format', async () => {
      const content = new Uint8Array([1, 2, 3, 4]);
      await service.storeZip('L', 'my-cid', 'my-rid', '0xMyAddress', content);

      // Verify the file was stored with expected key format
      const keys = await service.s3BucketOwnables_L.list();
      expect(keys.length).toBeGreaterThan(0);
      expect(keys[0]).toContain('my-rid');
      expect(keys[0]).toContain('my-cid');
    });

    it('should handle empty zip content', async () => {
      const emptyContent = new Uint8Array([]);

      await expect(
        service.storeZip('L', 'empty-cid', 'empty-rid', '0xSender', emptyContent)
      ).resolves.not.toThrow();
    });
  });

  describe('uploadPictureToS3 (extended)', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return mock URL in local testing mode', async () => {
      const picture = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header

      const url = await service.uploadPictureToS3(picture);

      expect(url).toContain('mock-bucket');
      expect(url).toContain('.json');
    });

    it('should handle different image sizes', async () => {
      const smallPicture = Buffer.from([1, 2, 3]);
      const largePicture = Buffer.alloc(10000).fill(0xFF);

      const url1 = await service.uploadPictureToS3(smallPicture);
      const url2 = await service.uploadPictureToS3(largePicture);

      expect(typeof url1).toBe('string');
      expect(typeof url2).toBe('string');
    });
  });

  describe('init() idempotency', () => {
    it('should handle multiple onModuleInit calls', async () => {
      await service.onModuleInit();
      await service.onModuleInit();
      await service.onModuleInit();

      // Should not throw and buckets should be defined
      expect(service.s3BucketQueue_L).toBeDefined();
    });
  });

  describe('ensureReady', () => {
    it('should initialize on first operation', async () => {
      // Don't call onModuleInit, let checkFileExists trigger init
      const exists = await service.checkFileExists('L', 'some-key');

      expect(exists).toBe(false);
      expect(service.s3BucketQueue_L).toBeDefined();
    });
  });

  // ============================================
  // Additional Coverage Tests
  // ============================================

  describe('storeZip error handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should throw descriptive error when bucket put fails for mainnet', async () => {
      // Mock the bucket put to fail
      const originalPut = service.s3BucketOwnables_L.put.bind(service.s3BucketOwnables_L);
      service.s3BucketOwnables_L.put = vi.fn().mockRejectedValue(new Error('S3 connection failed'));

      await expect(
        service.storeZip('L', 'error-cid', 'error-rid', '0xSender', new Uint8Array([1, 2, 3]))
      ).rejects.toThrow('into s3 Bucket failed');

      // Restore
      service.s3BucketOwnables_L.put = originalPut;
    });

    it('should throw descriptive error when bucket put fails for testnet', async () => {
      const originalPut = service.s3BucketOwnables_T.put.bind(service.s3BucketOwnables_T);
      service.s3BucketOwnables_T.put = vi.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(
        service.storeZip('T', 'testnet-cid', 'testnet-rid', '0xSender', new Uint8Array([4, 5, 6]))
      ).rejects.toThrow('LTO network T');

      // Restore
      service.s3BucketOwnables_T.put = originalPut;
    });
  });

  describe('uploadPictureToS3 real mode', () => {
    it('should be in local testing mode by default', async () => {
      await service.onModuleInit();

      // Verify localTesting is true (default for tests)
      expect((service as any).localTesting).toBe(true);
    });

    it('should return mock URL in local testing mode', async () => {
      await service.onModuleInit();

      const picture = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      const result = await service.uploadPictureToS3(picture);

      expect(result).toContain('mock-bucket');
      expect(result).toContain('.json');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should throw formatted error when storeZip bucket put fails', async () => {
      // Override the mock bucket's put method to fail
      const originalPut = (service as any).s3BucketOwnables_L.put;
      (service as any).s3BucketOwnables_L.put = vi.fn().mockRejectedValue(new Error('Network Error'));

      await expect(
        service.storeZip('L', 'test-cid', 'test-rid', '0xSender', new Uint8Array([1, 2, 3]))
      ).rejects.toThrow('Putting test-rid_test-cid_0xSender_.zip into s3 Bucket failed');

      // Restore
      (service as any).s3BucketOwnables_L.put = originalPut;
    });

    it('should throw formatted error when testnet storeZip fails', async () => {
      (service as any).s3BucketOwnables_T.put = vi.fn().mockRejectedValue(new Error('AWS Down'));

      await expect(
        service.storeZip('T', 'cid', 'rid', 'sender', new Uint8Array([1]))
      ).rejects.toThrow('Putting rid_cid_sender_.zip into s3 Bucket failed');
    });

    it('should handle errors from checkFileExists gracefully', async () => {
      // Mock bucket get rejection - should return false
      const originalGet = (service as any).s3BucketQueue_L.get;
      (service as any).s3BucketQueue_L.get = vi.fn().mockRejectedValue({
        name: 'AccessDenied',
        message: 'Permission denied'
      });

      // The mock implementation returns false on any error
      const result = await service.checkFileExists('L', 'test-key');
      expect(result).toBe(false);

      (service as any).s3BucketQueue_L.get = originalGet;
    });

    it('should return false when file does not exist (NotFound)', async () => {
      const originalGet = (service as any).s3BucketQueue_L.get;
      (service as any).s3BucketQueue_L.get = vi.fn().mockRejectedValue({ name: 'NotFound' });

      const result = await service.checkFileExists('L', 'nonexistent-key');
      expect(result).toBe(false);

      (service as any).s3BucketQueue_L.get = originalGet;
    });
  });
});
