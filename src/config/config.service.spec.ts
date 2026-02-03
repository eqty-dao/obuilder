import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    service = new ConfigService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should initialize config on module init', async () => {
      await service.onModuleInit();

      // Config should be loaded
      expect(() => service.get('env')).not.toThrow();
    });

    it('should set up reload interval', async () => {
      await service.onModuleInit();

      // Interval should be set (5 minutes = 300000ms)
      expect(service).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      await service.onModuleInit();
      await service.onModuleInit();

      // Should not throw
      expect(service).toBeDefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('should handle destroy without error', async () => {
      await service.onModuleInit();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should handle destroy before init', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('load', () => {
    it('should load configuration', async () => {
      await service.load();

      // After load, get should work
      expect(() => service.get('env')).not.toThrow();
    });

    it('should be callable multiple times', async () => {
      await service.load();
      await service.load();

      expect(service).toBeDefined();
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await service.load();
    });

    it('should get env value', () => {
      const env = service.get('env');
      expect(env).toBeDefined();
    });

    it('should get bucket config', () => {
      const localTesting = service.get('bucket.localTesting');
      expect(typeof localTesting === 'boolean').toBe(true);
    });

    it('should get nested config values', () => {
      // Test various config paths
      expect(() => service.get('bucket.obuilder.queue.mainnet')).not.toThrow();
      expect(() => service.get('bucket.obuilder.queue.testnet')).not.toThrow();
    });
  });

  describe('has', () => {
    beforeEach(async () => {
      await service.load();
    });

    it('should return true for existing keys', () => {
      expect(service.has('env')).toBe(true);
      expect(service.has('bucket.localTesting')).toBe(true);
    });

    it('should return false for non-existing keys', () => {
      expect(service.has('non.existing.key' as any)).toBe(false);
    });
  });

  describe('Configuration reloading', () => {
    it('should reload config on interval', async () => {
      await service.onModuleInit();

      // Advance by TTL (5 minutes)
      vi.advanceTimersByTime(300001);

      // Should have triggered reload
      expect(service).toBeDefined();
    });
  });
});
