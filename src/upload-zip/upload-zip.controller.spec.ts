import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadZipController } from './upload-zip.controller';
import { UploadZipService } from './upload-zip.service';
import { OwnableStatus } from '../interfaces/QueueEntry';
import { AuthError, UserError, DataError } from '../interfaces/error';

describe('UploadZipController', () => {
  let controller: UploadZipController;
  let mockService: Partial<UploadZipService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      queueRequest: vi.fn().mockResolvedValue('test-request-id'),
      getLogsByRequestId: vi.fn().mockReturnValue([{ message: 'test log' }]),
      getInQueueEntries: vi.fn().mockReturnValue([]),
      getProcessingEntries: vi.fn().mockReturnValue([]),
      getReadyEntries: vi.fn().mockReturnValue([]),
      getSentEntries: vi.fn().mockReturnValue([]),
      getQueueEntriesByRequestId: vi.fn().mockReturnValue(null),
      getQueueEntriesByWallet: vi.fn().mockReturnValue([]),
      getQueueEntriesByStatus: vi.fn().mockReturnValue([]),
      resendOwnableByRequestId: vi.fn().mockResolvedValue({ success: true }),
      queueStatus: vi.fn().mockReturnValue({ running: true }),
      isRelayServerUp: vi.fn().mockResolvedValue('SUCCESS: Relay is up'),
      isEVMAddress: vi.fn().mockReturnValue(true),
      isValidAddress: vi.fn().mockReturnValue('mainnet'),
      getAvailableNftChains: vi.fn().mockResolvedValue({ chains: [] }),
      templateCost: vi.fn().mockResolvedValue('1.00'),
      getServerWalletAddresses: vi.fn().mockReturnValue(['0xMainnet', '0xTestnet']),
      getServerEVMwalletAddresses: vi.fn().mockReturnValue(['0xEvmMainnet', '0xEvmTestnet']),
      GetServerETHBalance: vi.fn().mockResolvedValue('1.5'),
      getEqtyBalance: vi.fn().mockResolvedValue({ balance: '1000' }),
    };

    controller = new UploadZipController(mockService as UploadZipService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('uploadFile', () => {
    it('should return 400 for invalid file', async () => {
      const mockReq = {} as any;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await controller.uploadFile({} as any, null, mockReq, mockRes as any, 'mainnet');

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Failed to read data from HTTP request');
    });

    it('should return 201 with request ID on success', async () => {
      const mockFile = {
        originalname: 'test.zip',
        buffer: Buffer.from([1, 2, 3]),
      };
      const mockReq = {} as any;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await controller.uploadFile({} as any, mockFile, mockReq, mockRes as any, 'mainnet');

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith('test-request-id');
    });

    it('should map mainnet to L network ID', async () => {
      const mockFile = { originalname: 'test.zip', buffer: Buffer.from([1, 2, 3]) };
      const mockReq = {} as any;
      const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

      await controller.uploadFile({} as any, mockFile, mockReq, mockRes as any, 'mainnet');

      expect(mockService.queueRequest).toHaveBeenCalledWith('L', expect.any(Buffer), 1, mockReq);
    });

    it('should map testnet to T network ID', async () => {
      const mockFile = { originalname: 'test.zip', buffer: Buffer.from([1, 2, 3]) };
      const mockReq = {} as any;
      const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

      await controller.uploadFile({} as any, mockFile, mockReq, mockRes as any, 'testnet');

      expect(mockService.queueRequest).toHaveBeenCalledWith('T', expect.any(Buffer), 1, mockReq);
    });
  });

  describe('getLogsByRequestId', () => {
    it('should return logs from service', () => {
      const result = controller.getLogsByRequestId('test-rid');

      expect(result).toEqual([{ message: 'test log' }]);
      expect(mockService.getLogsByRequestId).toHaveBeenCalledWith('test-rid');
    });
  });

  describe('Queue Entry Endpoints', () => {
    it('getInQueueEntries should return entries for mainnet', () => {
      controller.getInQueueEntries('mainnet');
      expect(mockService.getInQueueEntries).toHaveBeenCalledWith('L');
    });

    it('getInQueueEntries should return entries for testnet', () => {
      controller.getInQueueEntries('testnet');
      expect(mockService.getInQueueEntries).toHaveBeenCalledWith('T');
    });

    it('getProcessingEntries should return entries', () => {
      controller.getProcessingEntries('mainnet');
      expect(mockService.getProcessingEntries).toHaveBeenCalledWith('L');
    });

    it('getReadyEntries should return entries', () => {
      controller.getReadyEntries('mainnet');
      expect(mockService.getReadyEntries).toHaveBeenCalledWith('L');
    });

    it('getSentEntries should return entries', () => {
      controller.getSentEntries('mainnet');
      expect(mockService.getSentEntries).toHaveBeenCalledWith('L');
    });

    it('getQueueEntriesByRequestId should call service', () => {
      controller.getQueueEntriesByRequestId('test-rid', 'mainnet');
      expect(mockService.getQueueEntriesByRequestId).toHaveBeenCalledWith('L', 'test-rid');
    });

    it('getQueueEntriesByWallet should call service', () => {
      controller.getQueueEntriesByWallet('0xWallet');
      expect(mockService.getQueueEntriesByWallet).toHaveBeenCalledWith('0xWallet');
    });

    it('getQueueEntriesByStatus should call service', () => {
      controller.getQueueEntriesByStatus(OwnableStatus.Ready, 'testnet');
      expect(mockService.getQueueEntriesByStatus).toHaveBeenCalledWith('T', OwnableStatus.Ready);
    });
  });

  describe('resendOwnableByRequestId', () => {
    it('should resend ownable on mainnet', async () => {
      const result = await controller.resendOwnableByRequestId('test-rid', 'mainnet');

      expect(result).toEqual({ success: true });
      expect(mockService.resendOwnableByRequestId).toHaveBeenCalledWith('L', 'test-rid');
    });

    it('should resend ownable on testnet', async () => {
      await controller.resendOwnableByRequestId('test-rid', 'testnet');
      expect(mockService.resendOwnableByRequestId).toHaveBeenCalledWith('T', 'test-rid');
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status', () => {
      const result = controller.getQueueStatus();

      expect(result).toEqual({ running: true });
      expect(mockService.queueStatus).toHaveBeenCalled();
    });
  });

  describe('isRelayServerUp', () => {
    it('should return success when relay is up', async () => {
      const result = await controller.isRelayServerUp();
      expect(result).toBe('SUCCESS: Relay is up');
    });

    it('should return error when relay fails', async () => {
      mockService.isRelayServerUp = vi.fn().mockRejectedValue(new Error('Relay down'));
      const result = await controller.isRelayServerUp();
      expect(result).toEqual({ error: 'Error: Relay down' });
    });
  });

  describe('Address Validation Endpoints', () => {
    it('isEVMAddress should return validation result', () => {
      const result = controller.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');

      expect(result).toBe(true);
      expect(mockService.isEVMAddress).toHaveBeenCalledWith('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
    });

    it('isEVMAddress should return error on exception', () => {
      mockService.isEVMAddress = vi.fn().mockImplementation(() => {
        throw new Error('Invalid');
      });

      const result = controller.isEVMAddress('invalid');
      expect(result).toEqual({ error: 'Error: Invalid' });
    });

    it('isValidAddress should return network type', () => {
      const result = controller.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
      expect(result).toBe('mainnet');
    });

    it('isValidAddress should return false on exception', () => {
      mockService.isValidAddress = vi.fn().mockImplementation(() => {
        throw new Error('Invalid');
      });

      const result = controller.isValidAddress('invalid');
      expect(result).toBe(false);
    });
  });

  describe('GetAvailableNftChains', () => {
    it('should return available chains', async () => {
      const result = await controller.GetAvailableNftChains();
      expect(result).toEqual({ chains: [] });
    });

    it('should return error on failure', async () => {
      mockService.getAvailableNftChains = vi.fn().mockRejectedValue(new Error('Failed'));
      const result = await controller.GetAvailableNftChains();
      expect(result).toEqual({ error: 'Error: Failed' });
    });
  });

  describe('templateCost', () => {
    it('should return template cost', async () => {
      const result = await controller.templateCost(1);
      expect(result).toBe('1.00');
    });

    it('should return error on failure', async () => {
      mockService.templateCost = vi.fn().mockRejectedValue(new Error('Not found'));
      const result = await controller.templateCost(999);
      expect(result).toEqual({ error: 'Error: Not found' });
    });
  });

  describe('getServerWalletAddresses', () => {
    it('should return wallet addresses', () => {
      const result = controller.getServerWalletAddresses();

      expect(result).toEqual({
        serverWalletAddress_mainnet: '0xMainnet',
        serverWalletAddress_testnet: '0xTestnet',
      });
    });

    it('should return error on failure', () => {
      mockService.getServerWalletAddresses = vi.fn().mockImplementation(() => {
        throw new Error('Failed');
      });

      const result = controller.getServerWalletAddresses();
      expect(result).toEqual({ error: 'Error: Failed' });
    });
  });

  describe('GetServerInfo', () => {
    it('should return complete server info', async () => {
      const result = await controller.GetServerInfo();

      expect(result).toHaveProperty('ServerBalanceARB_mainnet');
      expect(result).toHaveProperty('ServerBalanceARB_testnet');
      expect(result).toHaveProperty('ServerBalanceEQTY_mainnet');
      expect(result).toHaveProperty('ServerBalanceEQTY_testnet');
      expect(result).toHaveProperty('serverWalletAddress_mainnet');
      expect(result).toHaveProperty('serverWalletAddress_testnet');
    });

    it('should return error on failure', async () => {
      mockService.GetServerETHBalance = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await controller.GetServerInfo();
      expect(result).toEqual({ error: 'Error: Network error' });
    });
  });
});
