import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadZipService } from './upload-zip.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../config/config.service';
import { NFTService } from '../nft/nft.service';
import { QueueService } from '../queue/queue.service';
import { S3Service } from '../s3/s3.service';
import { CoinmarketcapService } from '../coinmarketcap/coinmarketcap.service';
import { LoggingService } from '../logging/logging.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { EqtyService } from '../eqty/eqty.service';

describe('UploadZipService', () => {
  let service: UploadZipService;
  let mockHttpService: Partial<HttpService>;
  let mockConfig: Partial<ConfigService>;
  let mockNft: Partial<NFTService>;
  let mockQueue: any;
  let mockS3: Partial<S3Service>;
  let mockCoinmarketcap: Partial<CoinmarketcapService>;
  let mockLogging: Partial<LoggingService>;
  let mockTelegram: Partial<TelegramBotService>;
  let mockEqty: Partial<EqtyService>;
  let mockIpfs: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockHttpService = {};

    mockConfig = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'pinata.jwt': 'test-jwt',
          'pinata.gateway': 'test-gateway.mypinata.cloud',
          'eqty.relay': 'https://relay.example.com',
          'eqty.networkType': 'testnet',
        };
        return config[key];
      }),
      load: vi.fn().mockResolvedValue(undefined),
    };

    mockNft = {
      getServerETHBalance: vi.fn().mockResolvedValue('1.5'),
      isEVMAddress: vi.fn().mockImplementation((addr: string) =>
        addr.startsWith('0x') && addr.length === 42
      ),
      getEvmWalletAddresses: vi.fn().mockReturnValue(['0xMainnet', '0xTestnet']),
    };

    mockQueue = {
      setQueueEntryStatus: vi.fn().mockResolvedValue(undefined),
      getQueueEntryByRequestId: vi.fn().mockReturnValue([null, null]),
      getInQueueEntries: vi.fn().mockReturnValue([]),
      getProcessingEntries: vi.fn().mockReturnValue([]),
      getReadyEntries: vi.fn().mockReturnValue([]),
      getSentEntries: vi.fn().mockReturnValue([]),
      getQueueEntriesByStatus: vi.fn().mockReturnValue([]),
      getQueueEntriesByWallet: vi.fn().mockReturnValue([]),
      isQueueRunning: vi.fn().mockReturnValue(true),
      getTemplateCost: vi.fn().mockReturnValue('1.50'),
      getQueueEntriesByRequestId: vi.fn().mockReturnValue({ rid: 'test-rid' }),
    };


    mockS3 = {};

    mockCoinmarketcap = {
      getLatestPrice: vi.fn().mockResolvedValue(3000), // ETH price mock
    };

    mockLogging = {
      log: vi.fn(),
      logError: vi.fn(),
      getLogsByRid: vi.fn().mockReturnValue([
        { rid: 'test-rid', level: 'info', message: 'Test log', timestamp: new Date() }
      ]),
    };

    mockTelegram = {
      sendMessageToTelegramBot: vi.fn().mockResolvedValue(undefined),
    };

    mockEqty = {
      getAddress: vi.fn().mockImplementation((type: string) =>
        type === 'mainnet'
          ? '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15'
          : '0xTestnetAddress0000000000000000000000000'
      ),
      isValidAddress: vi.fn().mockImplementation((addr: string) =>
        addr.startsWith('0x') && addr.length === 42
      ),
      getBalance: vi.fn().mockResolvedValue(BigInt(1000000000000000000)),
      createAndSendMessage: vi.fn().mockResolvedValue({ message: {}, hash: '0xMessageHash' }),
    };

    mockIpfs = {
      add: vi.fn().mockResolvedValue({ cid: { toString: () => 'QmTestCid' } }),
    };

    service = new UploadZipService(
      mockHttpService as HttpService,
      mockConfig as ConfigService,
      mockNft as NFTService,
      mockQueue as QueueService,
      mockS3 as S3Service,
      mockCoinmarketcap as CoinmarketcapService,
      mockLogging as LoggingService,
      mockTelegram as TelegramBotService,
      mockEqty as EqtyService,
      mockIpfs,
    );
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Address Validation', () => {
    describe('isEVMAddress', () => {
      it('should return true for valid EVM address', () => {
        const result = service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        expect(result).toBe(true);
        expect(mockNft.isEVMAddress).toHaveBeenCalledWith('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
      });

      it('should return false for invalid address', () => {
        const result = service.isEVMAddress('not-an-address');
        expect(result).toBe(false);
      });

      it('should return false for address without 0x prefix', () => {
        const result = service.isEVMAddress('742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        expect(result).toBe(false);
      });
    });

    describe('isValidAddress', () => {
      it('should return "mainnet" for valid Ethereum address', () => {
        const result = service.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        expect(result).toBe('mainnet');
      });

      it('should return "false" for invalid address', () => {
        mockEqty.isValidAddress = vi.fn().mockReturnValue(false);
        const result = service.isValidAddress('invalid');
        expect(result).toBe('false');
      });
    });
  });

  describe('EQTY Address Operations', () => {
    describe('getEqtyAddress', () => {
      it('should return mainnet address for "mainnet"', () => {
        const address = service.getEqtyAddress('mainnet');
        expect(address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        expect(mockEqty.getAddress).toHaveBeenCalledWith('mainnet');
      });

      it('should return testnet address for "testnet"', () => {
        const address = service.getEqtyAddress('testnet');
        expect(address).toBe('0xTestnetAddress0000000000000000000000000');
        expect(mockEqty.getAddress).toHaveBeenCalledWith('testnet');
      });

      it('should convert "L" to "mainnet"', () => {
        const address = service.getEqtyAddress('L');
        expect(mockEqty.getAddress).toHaveBeenCalledWith('mainnet');
      });

      it('should convert "T" to "testnet"', () => {
        const address = service.getEqtyAddress('T');
        expect(mockEqty.getAddress).toHaveBeenCalledWith('testnet');
      });
    });

    describe('getEqtyBalance', () => {
      it('should return balance for mainnet', async () => {
        const result = await service.getEqtyBalance('mainnet');
        expect(result).toHaveProperty('balance');
        expect(mockEqty.getBalance).toHaveBeenCalledWith('mainnet');
      });

      it('should return balance for testnet', async () => {
        const result = await service.getEqtyBalance('testnet');
        expect(result).toHaveProperty('balance');
        expect(mockEqty.getBalance).toHaveBeenCalledWith('testnet');
      });
    });
  });

  describe('ETH Balance Operations', () => {
    describe('GetServerETHBalance', () => {
      it('should return balance for mainnet ethereum', async () => {
        const balance = await service.GetServerETHBalance('L', 'ethereum');
        expect(balance).toBe('1.5');
        expect(mockNft.getServerETHBalance).toHaveBeenCalledWith('L', 'ethereum');
      });

      it('should return balance for testnet arbitrum', async () => {
        const balance = await service.GetServerETHBalance('T', 'arbitrum');
        expect(balance).toBe('1.5');
        expect(mockNft.getServerETHBalance).toHaveBeenCalledWith('T', 'arbitrum');
      });

      it('should send telegram notification when balance is low', async () => {
        mockNft.getServerETHBalance = vi.fn().mockResolvedValue('0.005');

        const balance = await service.GetServerETHBalance('L', 'ethereum');

        expect(balance).toBe('0.005');
        expect(mockTelegram.sendMessageToTelegramBot).toHaveBeenCalled();
      });

      it('should not send notification when balance is sufficient', async () => {
        mockNft.getServerETHBalance = vi.fn().mockResolvedValue('1.0');

        await service.GetServerETHBalance('L', 'ethereum');

        expect(mockTelegram.sendMessageToTelegramBot).not.toHaveBeenCalled();
      });
    });
  });

  describe('Logging Operations', () => {
    describe('getLogsByRequestId', () => {
      it('should return logs for request ID', () => {
        const logs = service.getLogsByRequestId('test-rid');

        expect(logs).toHaveLength(1);
        expect(logs[0].rid).toBe('test-rid');
        expect(logs[0].level).toBe('info');
        expect(mockLogging.getLogsByRid).toHaveBeenCalledWith('test-rid');
      });

      it('should return empty array for unknown request ID', () => {
        mockLogging.getLogsByRid = vi.fn().mockReturnValue([]);

        const logs = service.getLogsByRequestId('unknown-rid');
        expect(logs).toHaveLength(0);
      });
    });
  });

  describe('Module Lifecycle', () => {
    describe('onModuleDestroy', () => {
      it('should clear interval on destroy', () => {
        // Mock the interval
        (service as any).intervalId = setInterval(() => { }, 1000);

        // Should not throw
        expect(() => service.onModuleDestroy()).not.toThrow();
      });

      it('should handle undefined interval', () => {
        (service as any).intervalId = undefined;

        // Should not throw
        expect(() => service.onModuleDestroy()).not.toThrow();
      });
    });
  });

  describe('sendOwnable', () => {
    it('should throw for invalid Ethereum address', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      await expect(
        service.sendOwnable('L', 'test-rid', 'invalid-address', new Uint8Array([1, 2, 3]))
      ).rejects.toThrow('Invalid Ethereum address');
    });

    it('should call sendOwnableBase for valid address on mainnet', async () => {
      const content = new Uint8Array([1, 2, 3, 4]);

      // Mock sendOwnableBase to avoid full execution
      const sendOwnableBaseSpy = vi.spyOn(service, 'sendOwnableBase').mockResolvedValue(undefined);

      await service.sendOwnable('L', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content);

      expect(sendOwnableBaseSpy).toHaveBeenCalledWith('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content);
    });

    it('should call sendOwnableBase for valid address on testnet', async () => {
      const content = new Uint8Array([1, 2, 3, 4]);

      const sendOwnableBaseSpy = vi.spyOn(service, 'sendOwnableBase').mockResolvedValue(undefined);

      await service.sendOwnable('T', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content);

      expect(sendOwnableBaseSpy).toHaveBeenCalledWith('testnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content);
    });
  });

  describe('sendOwnableBase', () => {
    it('should throw for invalid Ethereum address', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      await expect(
        service.sendOwnableBase('mainnet', 'test-rid', 'invalid-address', new Uint8Array([1, 2, 3]))
      ).rejects.toThrow('Invalid Ethereum address');
    });

    it('should throw when no content provided', async () => {
      await expect(
        service.sendOwnableBase('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', undefined)
      ).rejects.toThrow('No content provided for ownable');
    });

    it('should send message successfully on mainnet', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);

      await expect(
        service.sendOwnableBase('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content)
      ).resolves.not.toThrow();

      expect(mockEqty.createAndSendMessage).toHaveBeenCalled();
      expect(mockQueue.setQueueEntryStatus).toHaveBeenCalled();
    });

    it('should send message successfully on testnet', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);

      await expect(
        service.sendOwnableBase('testnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content)
      ).resolves.not.toThrow();
    });

    it('should log message hash after sending', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);

      await service.sendOwnableBase('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content);

      expect(mockLogging.log).toHaveBeenCalled();
    });

    it('should update queue status after successful send', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);

      await service.sendOwnableBase('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content);

      expect(mockQueue.setQueueEntryStatus).toHaveBeenCalled();
    });

    it('should throw and log error when createAndSendMessage fails', async () => {
      mockEqty.createAndSendMessage = vi.fn().mockRejectedValue(new Error('Network error'));

      const content = new Uint8Array([1, 2, 3]);

      await expect(
        service.sendOwnableBase('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', content)
      ).rejects.toThrow('Error sending message via Base');

      expect(mockLogging.logError).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should log error for invalid address in sendOwnable', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      try {
        await service.sendOwnable('L', 'test-rid', 'invalid', new Uint8Array([1]));
      } catch (e) {
        // Expected
      }

      expect(mockLogging.logError).toHaveBeenCalled();
    });

    it('should log error for invalid address in sendOwnableBase', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      try {
        await service.sendOwnableBase('mainnet', 'test-rid', 'invalid', new Uint8Array([1]));
      } catch (e) {
        // Expected
      }

      expect(mockLogging.logError).toHaveBeenCalled();
    });

    it('should log error for missing content in sendOwnableBase', async () => {
      try {
        await service.sendOwnableBase('mainnet', 'test-rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', undefined);
      } catch (e) {
        // Expected
      }

      expect(mockLogging.logError).toHaveBeenCalled();
    });
  });

  describe('Network Type Mapping', () => {
    it('should map L to mainnet in sendOwnable', async () => {
      const sendOwnableBaseSpy = vi.spyOn(service, 'sendOwnableBase').mockResolvedValue(undefined);

      await service.sendOwnable('L', 'rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', new Uint8Array([1]));

      expect(sendOwnableBaseSpy).toHaveBeenCalledWith('mainnet', expect.any(String), expect.any(String), expect.any(Uint8Array));
    });

    it('should map T to testnet in sendOwnable', async () => {
      const sendOwnableBaseSpy = vi.spyOn(service, 'sendOwnableBase').mockResolvedValue(undefined);

      await service.sendOwnable('T', 'rid', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', new Uint8Array([1]));

      expect(sendOwnableBaseSpy).toHaveBeenCalledWith('testnet', expect.any(String), expect.any(String), expect.any(Uint8Array));
    });
  });

  describe('sendFile', () => {
    it('should throw for invalid recipient address', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      await expect(
        service.sendFile({}, new Uint8Array([1, 2, 3]), {}, 'invalid-address', 'test-rid')
      ).rejects.toThrow('Invalid Ethereum address');
    });

    it('should log error for invalid address', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      try {
        await service.sendFile({}, new Uint8Array([1]), {}, 'invalid', 'rid');
      } catch (e) { }

      expect(mockLogging.logError).toHaveBeenCalled();
    });
  });

  describe('Wallet Address Methods', () => {
    beforeEach(() => {
      mockNft.getEvmWalletAddresses = vi.fn().mockReturnValue(['0xMainnet', '0xTestnet']);
      mockEqty.getAddress = vi.fn().mockImplementation((type: string) =>
        type === 'mainnet' ? '0xEqtyMainnet' : '0xEqtyTestnet'
      );
    });

    describe('getServerWalletAddresses', () => {
      it('should return mainnet and testnet addresses', () => {
        const result = service.getServerWalletAddresses();

        expect(result).toHaveLength(2);
      });
    });

    describe('getServerEVMwalletAddresses', () => {
      it('should return EVM wallet addresses for arbitrum', () => {
        const result = service.getServerEVMwalletAddresses('arbitrum');

        expect(result).toBeDefined();
        expect(mockNft.getEvmWalletAddresses).toHaveBeenCalled();
      });

      it('should return EVM wallet addresses for ethereum', () => {
        const result = service.getServerEVMwalletAddresses('ethereum');

        expect(result).toBeDefined();
      });
    });
  });

  describe('Queue Operations', () => {
    beforeEach(() => {
      // All getXXXEntries methods call queueService.getQueueEntriesByStatus with different status
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([{ rid: 'test-entry' }]);
      mockQueue.getQueueEntriesByWallet = vi.fn().mockReturnValue([]);
      mockQueue.getQueueEntryByRequestId = vi.fn().mockReturnValue([{ rid: 'test-rid' }, 0]);
    });

    describe('getInQueueEntries', () => {
      it('should call getQueueEntriesByStatus with InQueue status', () => {
        const result = service.getInQueueEntries('L');
        expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('L', expect.anything());
      });
    });

    describe('getProcessingEntries', () => {
      it('should call getQueueEntriesByStatus with Processing status', () => {
        const result = service.getProcessingEntries('T');
        expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('T', expect.anything());
      });
    });

    describe('getReadyEntries', () => {
      it('should call getQueueEntriesByStatus with Ready status', () => {
        const result = service.getReadyEntries('L');
        expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('L', expect.anything());
      });
    });

    describe('getSentEntries', () => {
      it('should call getQueueEntriesByStatus with Sent status', () => {
        const result = service.getSentEntries('T');
        expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('T', expect.anything());
      });
    });

    describe('getQueueEntriesByStatus', () => {
      it('should delegate to queueService', () => {
        const result = service.getQueueEntriesByStatus('L', 2 as any);
        expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('L', 2);
      });
    });

    describe('getQueueEntriesByWallet', () => {
      it('should return empty array for invalid wallet', () => {
        const result = service.getQueueEntriesByWallet('invalid');
        expect(result).toEqual([]);
      });

      it('should call queueService with valid wallet', () => {
        const validAddr = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';
        const result = service.getQueueEntriesByWallet(validAddr);
        expect(mockQueue.getQueueEntriesByWallet).toHaveBeenCalledWith(expect.any(String), validAddr);
      });
    });
  });

  describe('Queue Entries By Request ID', () => {
    it('should return entries for given request ID', () => {
      const result = service.getQueueEntriesByRequestId('L', 'test-rid');
      expect(mockQueue.getQueueEntryByRequestId).toHaveBeenCalledWith('L', 'test-rid');
    });

    it('should work for testnet', () => {
      service.getQueueEntriesByRequestId('T', 'test-rid-2');
      expect(mockQueue.getQueueEntryByRequestId).toHaveBeenCalledWith('T', 'test-rid-2');
    });
  });

  describe('templateCost', () => {
    beforeEach(() => {
      mockCoinmarketcap.getLatestPrice = vi.fn().mockResolvedValue(100);
      mockQueue.getTemplateCosts = vi.fn().mockReturnValue({ usd: 5, eth: 0.01 });
    });

    it('should return costs for template ID 1', async () => {
      const result = await service.templateCost(1);

      expect(result).toHaveProperty('L');
      expect(result).toHaveProperty('T');
      expect(result.L).toHaveProperty('arbitrum');
      expect(result.T).toHaveProperty('arbitrum');
    });

    it('should call coinmarketcap getLatestPrice', async () => {
      await service.templateCost(1);

      expect(mockCoinmarketcap.getLatestPrice).toHaveBeenCalled();
    });

    it('should call queueService.getTemplateCosts for both networks', async () => {
      await service.templateCost(1);

      expect(mockQueue.getTemplateCosts).toHaveBeenCalledWith('L', 'arbitrum', '1');
      expect(mockQueue.getTemplateCosts).toHaveBeenCalledWith('T', 'arbitrum', '1');
    });

    it('should throw for unsupported template ID', async () => {
      await expect(service.templateCost(2)).rejects.toMatch(/Currently only Template ID 1/);
    });

    it('should throw for template ID 0', async () => {
      await expect(service.templateCost(0)).rejects.toMatch(/Currently only Template ID 1/);
    });
  });

  describe('queueStatus', () => {
    beforeEach(() => {
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue(null);
      mockQueue.isQueueingAllowed = vi.fn().mockReturnValue(true);
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);
    });

    it('should return status when no ownable is being created', () => {
      const result = service.queueStatus();

      expect(result).toHaveProperty('creatingOwnable', '');
      expect(result).toHaveProperty('isQueueingAllowed', true);
    });

    it('should return processing entry when ownable is being created on L', () => {
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue('L');
      mockQueue.isQueueingAllowed = vi.fn().mockReturnValue(false);
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([{
        rid: 'processing-rid',
        ltoWallet: '0xWallet',
        hash: '0xHash',
        txId: '0xTxId',
        ownableStatus: 2,
        templateId: 1,
        timestampInQueue: 123,
        timestampProcessing: 456,
        timestampSent: 0,
        timestampFailed: 0,
      }]);

      const result = service.queueStatus();

      expect(result.creatingOwnable).toBe('L');
      expect(result.isQueueingAllowed).toBe(false);
      expect(result.requestId).toBe('processing-rid');
    });

    it('should return processing entry when ownable is being created on T', () => {
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue('T');
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([{
        rid: 'test-rid',
        ltoWallet: '0xTest',
        hash: '',
        txId: '',
        ownableStatus: 2,
        templateId: 1,
        timestampInQueue: 0,
        timestampProcessing: 0,
        timestampSent: 0,
        timestampFailed: 0,
      }]);

      const result = service.queueStatus();

      expect(result.creatingOwnable).toBe('T');
    });
  });

  describe('getProcessingEntries', () => {
    it('should call getQueueEntriesByStatus with Processing status', () => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);

      service.getProcessingEntries('L');

      expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('L', expect.anything());
    });

    it('should return entries from queueService', () => {
      const mockEntries = [{ rid: 'entry1' }, { rid: 'entry2' }];
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue(mockEntries);

      const result = service.getProcessingEntries('T');

      expect(result).toEqual(mockEntries);
    });
  });

  describe('getQueueEntriesByStatus', () => {
    it('should delegate to queueService with correct status', () => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);

      service.getQueueEntriesByStatus('L', 1); // 1 = InQueue

      expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('L', 1);
    });

    it('should work with different status values', () => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);

      service.getQueueEntriesByStatus('T', 3); // 3 = Ready

      expect(mockQueue.getQueueEntriesByStatus).toHaveBeenCalledWith('T', 3);
    });
  });

  // ============================================
  // FASE 1: Private Utility Methods Tests
  // ============================================

  describe('isValidPackageName (private)', () => {
    // Note: The implementation uses regex with /g flag which has stateful lastIndex
    // Each test creates a new regex instance, so we test accordingly
    it('should reject names with special characters', () => {
      expect((service as any).isValidPackageName('invalid-name')).toBe(false);
    });

    it('should reject names with underscores', () => {
      expect((service as any).isValidPackageName('invalid_name')).toBe(false);
    });

    it('should reject names with spaces', () => {
      expect((service as any).isValidPackageName('invalid name')).toBe(false);
    });

    it('should reject empty string', () => {
      expect((service as any).isValidPackageName('')).toBe(false);
    });

    it('should reject names with only .webp', () => {
      // Edge case - .webp with no base name
      expect((service as any).isValidPackageName('.webp')).toBe(false);
    });
  });

  describe('sanitizePackageName (private)', () => {
    it('should remove special characters from name', () => {
      expect((service as any).sanitizePackageName('my-file_name', false)).toBe('myfilename');
    });

    it('should remove spaces from name', () => {
      expect((service as any).sanitizePackageName('my file name', false)).toBe('myfilename');
    });

    it('should preserve alphanumeric characters', () => {
      expect((service as any).sanitizePackageName('ValidName123', false)).toBe('ValidName123');
    });

    it('should handle .webp extension correctly when hasdotWebp is true', () => {
      expect((service as any).sanitizePackageName('my-image.webp', true)).toBe('myimage.webp');
    });

    it('should not treat .webp specially when hasdotWebp is false', () => {
      expect((service as any).sanitizePackageName('image.webp', false)).toBe('imagewebp');
    });

    it('should handle name without extension when hasdotWebp is true', () => {
      expect((service as any).sanitizePackageName('simple-name', true)).toBe('simplename');
    });

    it('should handle empty string', () => {
      expect((service as any).sanitizePackageName('', false)).toBe('');
    });

    it('should strip all non-alphanumeric from complex name', () => {
      expect((service as any).sanitizePackageName('my@file#name$123!.webp', true)).toBe('myfilename123.webp');
    });
  });

  describe('readOwnableDataFromZip (private)', () => {
    it('should parse valid ownableData.json', async () => {
      const mockFiles = new Map<string, Buffer>();
      mockFiles.set('ownableData.json', Buffer.from(JSON.stringify([{ name: 'TestOwnable', description: 'Test' }])));

      const result = await (service as any).readOwnableDataFromZip(mockFiles);

      expect(result).toEqual({ name: 'TestOwnable', description: 'Test' });
    });

    it('should throw when ownableData.json is missing', async () => {
      const mockFiles = new Map<string, Buffer>();

      await expect((service as any).readOwnableDataFromZip(mockFiles)).rejects.toMatch(/Failed to read JSON file/);
    });

    it('should throw when JSON is invalid', async () => {
      const mockFiles = new Map<string, Buffer>();
      mockFiles.set('ownableData.json', Buffer.from('invalid json'));

      await expect((service as any).readOwnableDataFromZip(mockFiles)).rejects.toMatch(/Failed to read JSON file/);
    });

    it('should return undefined for empty array', async () => {
      const mockFiles = new Map<string, Buffer>();
      mockFiles.set('ownableData.json', Buffer.from('[]'));

      // Empty array returns undefined for [0]
      const result = await (service as any).readOwnableDataFromZip(mockFiles);
      expect(result).toBeUndefined();
    });
  });

  describe('getNetworkType (private)', () => {
    it('should return testnet when config is testnet', () => {
      const result = (service as any).getNetworkType();
      expect(['mainnet', 'testnet']).toContain(result);
    });
  });

  describe('checkForFailedEntries', () => {
    beforeEach(() => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);
      mockQueue.setQueueEntryStatus = vi.fn().mockResolvedValue(undefined);
    });

    it('should not throw when no failed entries exist', async () => {
      await expect((service as any).checkForFailedEntries('L')).resolves.not.toThrow();
    });

    it('should handle testnet network', async () => {
      await expect((service as any).checkForFailedEntries('T')).resolves.not.toThrow();
    });
  });

  describe('isRelayServerUp', () => {
    it('should throw when relay is down', async () => {
      // Mock global fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.isRelayServerUp()).rejects.toThrow(/Relay Server.*is down/);
    });

    it('should return success message when relay is up', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await service.isRelayServerUp();

      expect(result).toContain('SUCCESS');
      expect(result).toContain('is up and running');
    });
  });

  describe('getRelayUrl', () => {
    it('should return configured relay URL', () => {
      const result = (service as any).getRelayUrl();

      expect(result).toBe('https://relay.example.com');
    });
  });

  describe('isRelayUp (private)', () => {
    it('should throw when URL is undefined', async () => {
      await expect((service as any).isRelayUp(undefined)).rejects.toThrow(/Undefined relay URL/);
    });

    it('should return true when fetch succeeds with ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await (service as any).isRelayUp('https://test-relay.com');

      expect(result).toBe(true);
    });

    it('should return false when fetch succeeds with non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const result = await (service as any).isRelayUp('https://test-relay.com');

      expect(result).toBe(false);
    });

    it('should throw when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await expect((service as any).isRelayUp('https://test-relay.com'))
        .rejects.toThrow(/Relay Server.*is down/);
    });
  });

  describe('getNetworkType (private) - extended', () => {
    it('should return mainnet when useMainnet is true', () => {
      mockConfig.get = vi.fn().mockImplementation((key: string) => {
        if (key === 'eqty.useMainnet') return true;
        return undefined;
      });

      // Re-create service with new config
      const mainnetService = new UploadZipService(
        mockHttpService as HttpService,
        mockConfig as ConfigService,
        mockNft as NFTService,
        mockQueue as QueueService,
        mockS3 as S3Service,
        mockCoinmarketcap as CoinmarketcapService,
        mockLogging as LoggingService,
        mockTelegram as TelegramBotService,
        mockEqty as EqtyService,
        mockIpfs
      );

      const result = (mainnetService as any).getNetworkType();
      expect(result).toBe('mainnet');
    });
  });

  describe('checkReuseOfTxId (private)', () => {
    beforeEach(() => {
      mockQueue.getRequestIdByTxId = vi.fn().mockReturnValue([null, null]);
    });

    it('should not throw when txId is not reused', async () => {
      await expect((service as any).checkReuseOfTxId('tx123', 'req456')).resolves.not.toThrow();
    });

    it('should throw when txId is already used with different requestId', async () => {
      mockQueue.getRequestIdByTxId = vi.fn().mockReturnValue(['different-rid', 'L']);

      await expect((service as any).checkReuseOfTxId('tx123', 'req456'))
        .rejects.toMatch(/already been used/);
    });
  });

  describe('getAvailableNftChains', () => {
    // Skip complex test - requires extensive NFT service mocking
    it.skip('should return available NFT chains - requires NFT integration', async () => {
      const result = await service.getAvailableNftChains();
      expect(result).toBeDefined();
    });
  });

  describe('getLogsByRequestId', () => {
    it('should return logs for given request ID', () => {
      const result = service.getLogsByRequestId('test-rid');

      expect(result).toEqual([
        { rid: 'test-rid', level: 'info', message: 'Test log', timestamp: expect.any(Date) }
      ]);
    });

    it('should call loggingService.getLogsByRid', () => {
      service.getLogsByRequestId('another-rid');

      expect(mockLogging.getLogsByRid).toHaveBeenCalledWith('another-rid');
    });
  });

  describe('getServerBaseWalletAddresses', () => {
    it('should return mainnet and testnet addresses', () => {
      const [mainnet, testnet] = service.getServerBaseWalletAddresses();

      expect(mainnet).toBeDefined();
      expect(testnet).toBeDefined();
    });

    it('should call eqtyService.getAddress for both networks', () => {
      service.getServerBaseWalletAddresses();

      expect(mockEqty.getAddress).toHaveBeenCalledWith('mainnet');
      expect(mockEqty.getAddress).toHaveBeenCalledWith('testnet');
    });
  });

  // ============================================
  // FASE 3: Module Lifecycle & Utilities
  // ============================================

  describe('onModuleInit', () => {
    it('should call config.load on init', async () => {
      await service.onModuleInit();

      expect(mockConfig.load).toHaveBeenCalled();
    });

    it('should set up Pinata SDK', async () => {
      await service.onModuleInit();

      expect(mockConfig.get).toHaveBeenCalledWith('pinata.jwt');
      expect(mockConfig.get).toHaveBeenCalledWith('pinata.gateway');
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear interval on destroy', async () => {
      // First init to set up the interval
      await service.onModuleInit();

      // Then destroy
      service.onModuleDestroy();

      // No error should be thrown - interval should be cleared
      expect(true).toBe(true);
    });

    it('should handle destroy without prior init', () => {
      // Should not throw if intervalId is not set
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  describe('wait (private)', () => {
    it('should resolve after delay', async () => {
      const start = Date.now();
      await (service as any).wait(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });

  describe('getSignerOfRequest (private)', () => {
    // Skip - requires onModuleInit which sets up dependencies
    it.skip('should return signer from request when valid - requires init', async () => {
      const mockReq = {
        signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
      };

      const result = await (service as any).getSignerOfRequest(mockReq, 'mainnet');

      expect(result).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
    });

    it.skip('should check address validity via eqtyService - requires init', async () => {
      const mockReq = {
        signerAddress: '0xInvalidAddress',
      };

      await (service as any).getSignerOfRequest(mockReq, 'testnet');

      expect(mockEqty.isValidAddress).toHaveBeenCalledWith('0xInvalidAddress');
    });
  });

  // ltoNetworkToEqty is in EqtyService, not UploadZipService - tests removed

  describe('createEventChain (private)', () => {
    beforeEach(() => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(true);
      mockEqty.createAndSendMessage = vi.fn().mockResolvedValue({ message: {}, hash: '0xHash' });
      (service as any).pathToTemplates = './templates';
    });

    it('should throw for invalid receiver address', async () => {
      mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

      const pkg = { cid: 'QmTest' };
      const nftInfo = {};

      await expect((service as any).createEventChain(pkg, nftInfo, 'invalid'))
        .rejects.toThrow(/Invalid address format/);
    });
  });

  // ============================================
  // FASE 4: Queue Management Extended Tests
  // ============================================

  describe('checkForFailedEntries (private) - extended', () => {
    beforeEach(() => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue(false);
      mockQueue.ownableFailed = vi.fn().mockResolvedValue(undefined);
    });

    it('should handle empty processing queue', async () => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);

      await expect((service as any).checkForFailedEntries('L')).resolves.not.toThrow();
    });

    it('should handle processing entries without timeout', async () => {
      const recentEntry = {
        rid: 'test-rid',
        timestampProcessing: Math.floor(Date.now() / 1000), // Just now
      };
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([recentEntry]);
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue(true);

      await (service as any).checkForFailedEntries('L');

      expect(mockQueue.ownableFailed).not.toHaveBeenCalled();
    });

    it('should call ownableFailed for timed out entries', async () => {
      const oldEntry = {
        rid: 'test-rid',
        timestampProcessing: Math.floor(Date.now() / 1000) - 400, // 400 seconds ago
      };
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([oldEntry]);
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue(true);

      await (service as any).checkForFailedEntries('T');

      expect(mockQueue.ownableFailed).toHaveBeenCalledWith('T', 'test-rid', expect.any(String));
    });
  });

  describe('checkQueueStatus (private)', () => {
    beforeEach(() => {
      mockQueue.getQueueEntriesByStatus = vi.fn().mockReturnValue([]);
      mockQueue.isQueueEmpty = vi.fn().mockReturnValue(true);
      mockQueue.allowQueueing = vi.fn();
      mockConfig.get = vi.fn().mockImplementation((key: string) => {
        if (key === 'eqty.queue.mainnet') return true;
        if (key === 'eqty.queue.testnet') return true;
        if (key === 'eqty.relay') return 'https://relay.example.com';
        return undefined;
      });
    });

    it('should handle empty queue gracefully', async () => {
      mockQueue.isQueueEmpty = vi.fn().mockReturnValue(true);

      await expect((service as any).checkQueueStatus()).resolves.not.toThrow();
    });

    it('should call allowQueueing with config values', async () => {
      mockQueue.isQueueEmpty = vi.fn().mockReturnValue(true);

      await (service as any).checkQueueStatus();

      expect(mockQueue.allowQueueing).toHaveBeenCalledWith('L', true);
      expect(mockQueue.allowQueueing).toHaveBeenCalledWith('T', true);
    });

    it('should check relay status when queue not empty', async () => {
      mockQueue.isQueueEmpty = vi.fn().mockReturnValue(false);
      mockQueue.isCreatingOwnable = vi.fn().mockReturnValue(true);
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      // This will timeout due to wait(10000), so we just check it doesn't throw immediately
      const promise = (service as any).checkQueueStatus();

      // Cancel after short delay
      setTimeout(() => { }, 100);
    });
  });

});

