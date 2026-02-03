import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EthersService } from './ethers.service';
import { ConfigService } from '../config/config.service';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    AlchemyProvider: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(BigInt(1000000000000000000)),
    })),
    Wallet: {
      fromPhrase: vi.fn().mockImplementation((mnemonic, provider) => ({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
        provider,
      })),
    },
    Contract: vi.fn().mockImplementation(() => ({
      getNftCount: vi.fn().mockResolvedValue(BigInt(5)),
      ownerOf: vi.fn().mockResolvedValue('0xOwnerAddress'),
      isBridge: vi.fn().mockResolvedValue(true),
      getBridgeBaseURI: vi.fn().mockResolvedValue('https://bridge.example.com/'),
      getTokenURI: vi.fn().mockResolvedValue('ipfs://QmTestHash'),
      mint: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) }),
      getBridgeCount: vi.fn().mockResolvedValue(3),
      getBridges: vi.fn().mockResolvedValue([['0xBridge1'], ['ipfs://base1']]),
      getListOfNftIdsPerAddress: vi.fn().mockResolvedValue([1, 2, 3]),
      transferFrom: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) }),
    })),
    formatUnits: vi.fn().mockReturnValue('1.0'),
    isAddress: vi.fn().mockImplementation((addr: string) => addr.startsWith('0x') && addr.length === 42),
  },
}));

describe('EthersService', () => {
  let service: EthersService;
  let mockConfig: Partial<ConfigService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'eth.account.mnemonic.mainnet': 'test mnemonic mainnet phrase here twelve words',
          'eth.account.mnemonic.testnet': 'test mnemonic testnet phrase here twelve words',
          'eth.account.eth_alchemy_api_key': 'test-eth-api-key',
          'eth.account.arbitrum_alchemy_api_key': 'test-arbitrum-api-key',
          'eth.account.polygon_alchemy_api_key': 'test-polygon-api-key',
          'eth.contracts.ethereum.mainnet': '0xEthereumMainnetContract',
          'eth.contracts.ethereum.testnet': '0xEthereumTestnetContract',
          'eth.contracts.arbitrum.mainnet': '0xArbitrumMainnetContract',
          'eth.contracts.arbitrum.testnet': '0xArbitrumTestnetContract',
        };
        return config[key];
      }),
    };

    service = new EthersService(mockConfig as ConfigService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should implement onModuleInit', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('isEVMAddress', () => {
    it('should return true for valid Ethereum address', () => {
      expect(service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(true);
    });

    it('should return false for invalid address', () => {
      expect(service.isEVMAddress('not-an-address')).toBe(false);
    });

    it('should return false for address without 0x prefix', () => {
      expect(service.isEVMAddress('742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(false);
    });
  });

  describe('getEvmWalletAddresses', () => {
    it('should return mainnet and testnet addresses for ethereum', () => {
      const [mainnet, testnet] = service.getEvmWalletAddresses('ethereum');
      expect(mainnet).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
      expect(testnet).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
    });

    it('should return addresses for arbitrum network', () => {
      const [mainnet, testnet] = service.getEvmWalletAddresses('arbitrum');
      expect(mainnet).toBeDefined();
      expect(testnet).toBeDefined();
    });

    it('should return addresses for polygon network', () => {
      const [mainnet, testnet] = service.getEvmWalletAddresses('polygon');
      expect(mainnet).toBeDefined();
      expect(testnet).toBeDefined();
    });
  });

  describe('getServerETHBalance', () => {
    it('should return balance for mainnet', async () => {
      const balance = await service.getServerETHBalance('L', 'ethereum');
      expect(balance).toBe('1.0');
    });

    it('should return balance for testnet', async () => {
      const balance = await service.getServerETHBalance('T', 'ethereum');
      expect(balance).toBe('1.0');
    });

    it('should work with arbitrum network', async () => {
      const balance = await service.getServerETHBalance('L', 'arbitrum');
      expect(balance).toBe('1.0');
    });
  });

  describe('NFT Operations', () => {
    const mockNftInfo = {
      network: 'ethereum',
      address: '0xNftContractAddress0000000000000000000000',
      id: 1,
    };

    it('should get NFT count', async () => {
      const count = await service.getNFTcount('L', mockNftInfo);
      expect(count).toBe('5');
    });

    it('should get owner of NFT', async () => {
      const owner = await service.getOwnerOfNFT('L', mockNftInfo);
      expect(owner).toBe('0xOwnerAddress');
    });

    it('should check if address is bridge', async () => {
      const isBridge = await service.isBridge('L', '0xBridgeAddress', mockNftInfo);
      expect(isBridge).toBe(true);
    });

    it('should get bridge base URI', async () => {
      const uri = await service.getBridgeBaseURI('L', '0xBridgeAddress', mockNftInfo);
      expect(uri).toBe('https://bridge.example.com/');
    });

    it('should get token URI', async () => {
      const uri = await service.getTokenURI('L', mockNftInfo);
      expect(uri).toBe('ipfs://QmTestHash');
    });

    it('should get bridge count', async () => {
      const count = await service.getBridgeCount('L', mockNftInfo);
      expect(count).toBe(3);
    });

    it('should get bridges', async () => {
      const [addresses, uris] = await service.getBridges('L', mockNftInfo);
      expect(addresses).toContain('0xBridge1');
      expect(uris).toContain('ipfs://base1');
    });
  });

  describe('mintNFT', () => {
    const mockNftInfo = {
      network: 'ethereum',
      address: '0xNftContractAddress0000000000000000000000',
      id: 0,
    };

    it('should mint NFT and return new ID', async () => {
      const newId = await service.mintNFT('L', '0xReceiverAddress', 'ipfs://metadata', mockNftInfo);
      expect(newId).toBe(5);
    });

    it('should work on testnet', async () => {
      const newId = await service.mintNFT('T', '0xReceiverAddress', 'ipfs://metadata', mockNftInfo);
      expect(newId).toBe(5);
    });
  });

  describe('getListOfNftIdsPerAddress', () => {
    it('should get NFT IDs for ethereum mainnet', async () => {
      const ids = await service.getListOfNftIdsPerAddress('L', 'ethereum', '0xWalletAddress');
      expect(ids).toEqual([1, 2, 3]);
    });

    it('should get NFT IDs for ethereum testnet', async () => {
      const ids = await service.getListOfNftIdsPerAddress('T', 'ethereum', '0xWalletAddress');
      expect(ids).toEqual([1, 2, 3]);
    });

    it('should get NFT IDs for arbitrum mainnet', async () => {
      const ids = await service.getListOfNftIdsPerAddress('L', 'arbitrum', '0xWalletAddress');
      expect(ids).toEqual([1, 2, 3]);
    });

    it('should get NFT IDs for arbitrum testnet', async () => {
      const ids = await service.getListOfNftIdsPerAddress('T', 'arbitrum', '0xWalletAddress');
      expect(ids).toEqual([1, 2, 3]);
    });

    it('should throw for unsupported network', async () => {
      await expect(
        service.getListOfNftIdsPerAddress('L', 'unsupported', '0xWallet')
      ).rejects.toThrow('Unknown EVM Network');
    });
  });

  describe('transferNFT', () => {
    const mockNftInfo = {
      network: 'ethereum',
      address: '0xNftContractAddress0000000000000000000000',
      id: 1,
    };

    it('should transfer NFT and return new owner', async () => {
      const newOwner = await service.transferNFT('L', '0xNewOwnerAddress', mockNftInfo);
      expect(newOwner).toBe('0xOwnerAddress');
    });

    it('should work on testnet', async () => {
      const newOwner = await service.transferNFT('T', '0xNewOwnerAddress', mockNftInfo);
      expect(newOwner).toBe('0xOwnerAddress');
    });
  });
});
