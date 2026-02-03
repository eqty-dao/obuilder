import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NFTService } from './nft.service';
import { EthersService } from '../ethers/ethers.service';

describe('NFTService', () => {
    let service: NFTService;
    let mockEthersService: Partial<EthersService>;

    const mockNftInfo = {
        network: 'ethereum',
        address: '0xNftContractAddress0000000000000000000000',
        id: 1,
    };

    beforeEach(() => {
        mockEthersService = {
            getEvmWalletAddresses: vi.fn().mockReturnValue(['0xMainnetAddress', '0xTestnetAddress']),
            isEVMAddress: vi.fn().mockImplementation((addr: string) => addr.startsWith('0x') && addr.length === 42),
            getNFTcount: vi.fn().mockResolvedValue('10'),
            getOwnerOfNFT: vi.fn().mockResolvedValue('0xOwnerAddress'),
            isBridge: vi.fn().mockResolvedValue(true),
            getBridgeBaseURI: vi.fn().mockResolvedValue('https://bridge.example.com/'),
            getServerETHBalance: vi.fn().mockResolvedValue('1.5'),
            getTokenURI: vi.fn().mockResolvedValue('ipfs://QmTestHash'),
            mintNFT: vi.fn().mockResolvedValue(5),
            getBridgeCount: vi.fn().mockResolvedValue(3),
            getBridges: vi.fn().mockResolvedValue([['0xBridge1', '0xBridge2'], ['uri1', 'uri2']]),
            getListOfNftIdsPerAddress: vi.fn().mockResolvedValue([1, 2, 3, 4]),
            transferNFT: vi.fn().mockResolvedValue('0xNewOwnerAddress'),
        };

        service = new NFTService(mockEthersService as EthersService);
    });

    describe('Initialization', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });
    });

    describe('Wallet Operations', () => {
        it('should get EVM wallet addresses', () => {
            const [mainnet, testnet] = service.getEvmWalletAddresses('ethereum');
            expect(mainnet).toBe('0xMainnetAddress');
            expect(testnet).toBe('0xTestnetAddress');
            expect(mockEthersService.getEvmWalletAddresses).toHaveBeenCalledWith('ethereum');
        });

        it('should validate EVM address', () => {
            expect(service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(true);
            expect(service.isEVMAddress('invalid')).toBe(false);
        });
    });

    describe('NFT Count and Owner', () => {
        it('should get NFT count', async () => {
            const count = await service.getNFTcount('L', mockNftInfo);
            expect(count).toBe('10');
            expect(mockEthersService.getNFTcount).toHaveBeenCalledWith('L', mockNftInfo);
        });

        it('should get owner of NFT', async () => {
            const owner = await service.getOwnerOfNFT('L', mockNftInfo);
            expect(owner).toBe('0xOwnerAddress');
            expect(mockEthersService.getOwnerOfNFT).toHaveBeenCalledWith('L', mockNftInfo);
        });
    });

    describe('Bridge Operations', () => {
        it('should check if address is bridge', async () => {
            const result = await service.isBridge('L', '0xBridgeAddress', mockNftInfo);
            expect(result).toBe(true);
            expect(mockEthersService.isBridge).toHaveBeenCalledWith('L', '0xBridgeAddress', mockNftInfo);
        });

        it('should get bridge base URI', async () => {
            const uri = await service.getBridgeBaseURI('L', '0xBridgeAddress', mockNftInfo);
            expect(uri).toBe('https://bridge.example.com/');
        });

        it('should get bridge count', async () => {
            const count = await service.getBridgeCount('L', mockNftInfo);
            expect(count).toBe(3);
        });

        it('should get bridges list', async () => {
            const [addresses, uris] = await service.getBridges('T', mockNftInfo);
            expect(addresses).toHaveLength(2);
            expect(uris).toHaveLength(2);
        });
    });

    describe('Balance and Token Operations', () => {
        it('should get server ETH balance', async () => {
            const balance = await service.getServerETHBalance('L', 'ethereum');
            expect(balance).toBe('1.5');
            expect(mockEthersService.getServerETHBalance).toHaveBeenCalledWith('L', 'ethereum');
        });

        it('should get token URI', async () => {
            const uri = await service.getTokenURI('L', mockNftInfo);
            expect(uri).toBe('ipfs://QmTestHash');
        });
    });

    describe('Minting and Transfer', () => {
        it('should mint NFT', async () => {
            const newId = await service.mintNFT('L', '0xReceiver', 'ipfs://metadata', mockNftInfo);
            expect(newId).toBe(5);
            expect(mockEthersService.mintNFT).toHaveBeenCalledWith('L', '0xReceiver', 'ipfs://metadata', mockNftInfo);
        });

        it('should transfer NFT', async () => {
            const newOwner = await service.transferNFT('L', '0xNewOwner', mockNftInfo);
            expect(newOwner).toBe('0xNewOwnerAddress');
            expect(mockEthersService.transferNFT).toHaveBeenCalledWith('L', '0xNewOwner', mockNftInfo);
        });
    });

    describe('NFT ID Lookups', () => {
        it('should get list of NFT IDs per address', async () => {
            const ids = await service.getListOfNftIdsPerAddress('L', 'ethereum', '0xWalletAddress');
            expect(ids).toEqual([1, 2, 3, 4]);
            expect(mockEthersService.getListOfNftIdsPerAddress).toHaveBeenCalledWith('L', 'ethereum', '0xWalletAddress');
        });

        it('should work with testnet', async () => {
            const ids = await service.getListOfNftIdsPerAddress('T', 'arbitrum', '0xWalletAddress');
            expect(ids).toEqual([1, 2, 3, 4]);
        });
    });
});
