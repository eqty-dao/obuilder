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

});
