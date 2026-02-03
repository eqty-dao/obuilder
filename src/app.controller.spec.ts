import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let mockAppService: Partial<AppService>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T00:00:00Z'));

    mockAppService = {
      getInfo: vi.fn().mockReturnValue({
        name: '@eqty/ownable-builder',
        version: '1.0.0',
        description: 'Ownable Builder Service',
        env: 'test',
      }),
    };

    controller = new AppController(mockAppService as AppService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('root', () => {
    it('should return 200 OK for ELB health check requests', () => {
      const mockReq = {
        headers: {
          'user-agent': 'ELB-HealthChecker/2.0',
        },
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        redirect: vi.fn(),
      };

      controller.root(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
    });

    it('should redirect to /api for regular requests', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        redirect: vi.fn(),
      };

      controller.root(mockReq as any, mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith('/api');
    });

    it('should redirect to /api when user-agent is undefined', () => {
      const mockReq = {
        headers: {},
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        redirect: vi.fn(),
      };

      controller.root(mockReq as any, mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith('/api');
    });
  });

  describe('health', () => {
    it('should return health status object', () => {
      const result = controller.health();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('environment');
    });

    it('should return status as "ok"', () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
    });

    it('should return valid ISO timestamp', () => {
      const result = controller.health();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should return uptime in seconds format', () => {
      // Advance time by 100 seconds
      vi.advanceTimersByTime(100000);

      const result = controller.health();
      expect(result.uptime).toBe('100s');
    });

    it('should return version from env or default', () => {
      const result = controller.health();
      expect(result.version).toBeDefined();
    });

    it('should return environment from NODE_ENV or default to development', () => {
      const result = controller.health();
      expect(['development', 'test', 'production']).toContain(result.environment);
    });
  });

  describe('getInfo', () => {
    it('should return info from AppService', () => {
      const result = controller.getInfo('test-text', 'test-name');

      expect(result).toBeDefined();
      expect(result.name).toBe('@eqty/ownable-builder');
      expect(result.version).toBe('1.0.0');
    });

    it('should call AppService.getInfo with parameters', () => {
      controller.getInfo('my-text', 'my-name');

      expect(mockAppService.getInfo).toHaveBeenCalledWith('my-text', 'my-name');
    });

    it('should handle undefined text parameter', () => {
      const result = controller.getInfo(undefined as any, 'name');

      expect(result).toBeDefined();
      expect(mockAppService.getInfo).toHaveBeenCalledWith(undefined, 'name');
    });

    it('should handle undefined name parameter', () => {
      const result = controller.getInfo('text', undefined as any);

      expect(result).toBeDefined();
      expect(mockAppService.getInfo).toHaveBeenCalledWith('text', undefined);
    });

    it('should handle empty strings', () => {
      const result = controller.getInfo('', '');

      expect(result).toBeDefined();
      expect(mockAppService.getInfo).toHaveBeenCalledWith('', '');
    });
  });
});
