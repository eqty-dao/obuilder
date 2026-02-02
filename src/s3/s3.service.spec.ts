import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock AWS SDK before imports
vi.mock('@aws-sdk/client-s3', () => ({
  S3: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  CreateBucketCommand: vi.fn(),
  HeadBucketCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

vi.mock('any-bucket/s3', () => ({
  default: vi.fn().mockImplementation((client, bucket) => ({
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('')),
    delete: vi.fn().mockResolvedValue(undefined),
    bucketName: bucket,
  })),
}));

import { S3Service } from './s3.service';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

/**
 * S3Service manages AWS S3 bucket operations for:
 * - Queue files (Queue.json) for the processing queue
 * - Logs bucket for obuilder logs
 * - Ownables buckets for completed NFT files
 */
describe('S3Service', () => {
  let service: S3Service;
  let mockConfigService: any;
  let mockTelegramService: any;

  // Mock config values
  const mockConfigValues: Record<string, any> = {
    'bucket.localTesting': true,
    'bucket.obuilder.queue.mainnet': 'test-queue-mainnet',
    'bucket.obuilder.queue.testnet': 'test-queue-testnet',
    'bucket.obuilder.logs': 'test-logs',
    'bucket.obuilder.ownables.mainnet': 'test-ownables-mainnet',
    'bucket.obuilder.ownables.testnet': 'test-ownables-testnet',
  };

  beforeEach(async () => {
    // Create mock services
    mockConfigService = {
      load: vi.fn().mockResolvedValue(undefined),
      get: vi.fn((key: string) => mockConfigValues[key]),
      has: vi.fn((key: string) => key in mockConfigValues),
    };

    mockTelegramService = {
      sendMessageToTelegramBot: vi.fn(),
    };

    // Create S3Service instance directly with mocked dependencies
    service = new S3Service(
      mockConfigService as unknown as ConfigService,
      mockTelegramService as unknown as TelegramBotService
    );

    // Manually call onModuleInit
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have S3 bucket instances configured after init', () => {
    expect(service.s3BucketQueue_L).toBeDefined();
    expect(service.s3BucketQueue_T).toBeDefined();
    expect(service.s3BucketLogs).toBeDefined();
    expect(service.s3BucketOwnables_L).toBeDefined();
    expect(service.s3BucketOwnables_T).toBeDefined();
  });

  it('should call config.load on initialization', () => {
    expect(mockConfigService.load).toHaveBeenCalled();
  });

  it('should read bucket config values', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('bucket.localTesting');
    expect(mockConfigService.get).toHaveBeenCalledWith('bucket.obuilder.queue.mainnet');
    expect(mockConfigService.get).toHaveBeenCalledWith('bucket.obuilder.queue.testnet');
  });
});
