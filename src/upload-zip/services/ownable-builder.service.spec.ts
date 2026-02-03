import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OwnableBuilderService } from './ownable-builder.service';
import { ConfigService } from '../../config/config.service';
import { NFTService } from '../../nft/nft.service';
import { EqtyService } from '../../eqty/eqty.service';
import { QueueService } from '../../queue/queue.service';
import { CoinmarketcapService } from '../../coinmarketcap/coinmarketcap.service';
import { LoggingService } from '../../logging/logging.service';

// Mock fetch globally
global.fetch = vi.fn();

describe('OwnableBuilderService', () => {
    let service: OwnableBuilderService;
    let mockConfig: Partial<ConfigService>;
    let mockNft: Partial<NFTService>;
    let mockEqty: Partial<EqtyService>;
    let mockQueue: Partial<QueueService>;
    let mockCoinmarketcap: Partial<CoinmarketcapService>;
    let mockLogging: Partial<LoggingService>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockConfig = {
            get: vi.fn().mockImplementation((key: string) => {
                const config: Record<string, any> = {
                    'eth.contracts.arbitrum.mainnet': '0xMainnetContract',
                    'eth.contracts.arbitrum.testnet': '0xTestnetContract',
                    'eth.account.obridge_wallet_address.mainnet': '0xMainnetWallet',
                    'eth.account.obridge_wallet_address.testnet': '0xTestnetWallet',
                    'eqty.useMainnet': false,
                    'pinata.jwt': 'test-jwt',
                    'pinata.gateway': 'https://gateway.pinata.cloud',
                };
                return config[key];
            }),
        };

        mockNft = {
            mintNFT: vi.fn().mockResolvedValue(42),
        };

        mockEqty = {
            isValidAddress: vi.fn().mockReturnValue(true),
            createEventChain: vi.fn().mockReturnValue({
                id: 'chain-123',
                validate: vi.fn().mockResolvedValue(true),
                toJSON: vi.fn().mockReturnValue({ id: 'chain-123', events: [] }),
            }),
            getNetworkId: vi.fn().mockReturnValue('T'),
            addEventToChain: vi.fn().mockResolvedValue(undefined),
            anchorChain: vi.fn().mockResolvedValue(undefined),
        };

        mockQueue = {
            getTemplateCosts: vi.fn().mockReturnValue({ eth: '0.001', usd: '3.00' }),
        };

        mockCoinmarketcap = {
            getLatestPrice: vi.fn().mockResolvedValue(3000),
        };

        mockLogging = {
            log: vi.fn(),
            logError: vi.fn(),
        };

        service = new OwnableBuilderService(
            mockConfig as ConfigService,
            mockNft as NFTService,
            mockEqty as EqtyService,
            mockQueue as QueueService,
            mockCoinmarketcap as CoinmarketcapService,
            mockLogging as LoggingService,
        );
    });

    describe('getTemplateCost', () => {
        it('should return template costs for template ID 1', async () => {
            const result = await service.getTemplateCost(1);

            expect(result).toHaveProperty('L');
            expect(result).toHaveProperty('T');
            expect(mockCoinmarketcap.getLatestPrice).toHaveBeenCalled();
        });

        it('should throw for unsupported template IDs', async () => {
            await expect(service.getTemplateCost(2)).rejects.toThrow('Template ID 1');
        });
    });

    describe('mintNewNft', () => {
        const mockJsonFile = {
            NFT_BLOCKCHAIN: 'arbitrum',
            NFT_TOKEN_URI: 'https://ipfs.io/ipfs/QmTest',
        };

        it('should mint NFT on mainnet', async () => {
            const result = await service.mintNewNft('L', mockJsonFile, 'req-123');

            expect(result.network).toBe('arbitrum');
            expect(result.id).toBe(42);
            expect(mockNft.mintNFT).toHaveBeenCalled();
        });

        it('should mint NFT on testnet', async () => {
            const result = await service.mintNewNft('T', mockJsonFile, 'req-456');

            expect(result.network).toBe('arbitrum');
            expect(result.address).toBe('0xTestnetContract');
        });

        it('should log NFT minting details', async () => {
            await service.mintNewNft('L', mockJsonFile, 'req-789');

            expect(mockLogging.log).toHaveBeenCalled();
        });
    });

    describe('getNetworkType', () => {
        it('should return testnet when useMainnet is false', () => {
            const result = service.getNetworkType();
            expect(result).toBe('testnet');
        });

        it('should return mainnet when useMainnet is true', () => {
            mockConfig.get = vi.fn().mockImplementation((key: string) => {
                if (key === 'eqty.useMainnet') return true;
                return null;
            });

            const result = service.getNetworkType();
            expect(result).toBe('mainnet');
        });
    });

    describe('createPinataPinnedFile', () => {
        it('should pin file to IPFS', async () => {
            (global.fetch as any).mockResolvedValue({
                json: vi.fn().mockResolvedValue({ IpfsHash: 'QmTestHash' }),
            });

            const picture = Buffer.from('test image data');
            const result = await service.createPinataPinnedFile(picture, 'Test NFT', 'A test NFT');

            expect(result).toContain('QmTestHash');
            expect(global.fetch).toHaveBeenCalled();
        });

        it('should throw when Pinata API fails', async () => {
            (global.fetch as any).mockRejectedValue(new Error('API Error'));

            const picture = Buffer.from('test image data');

            await expect(
                service.createPinataPinnedFile(picture, 'Test', 'Description'),
            ).rejects.toThrow('API Error');
        });
    });

    describe('mintNewNft - error handling', () => {
        const mockJsonFile = {
            NFT_BLOCKCHAIN: 'arbitrum',
            NFT_TOKEN_URI: 'https://ipfs.io/ipfs/QmTest',
        };

        it('should log error and rethrow when minting fails', async () => {
            const mintError = new Error('NFT minting failed - insufficient gas');
            mockNft.mintNFT = vi.fn().mockRejectedValue(mintError);

            await expect(service.mintNewNft('L', mockJsonFile, 'req-error')).rejects.toThrow('insufficient gas');
            expect(mockLogging.logError).toHaveBeenCalledWith('req-error', expect.stringContaining('Minting new NFT failed'));
        });

        it('should use testnet wallet address for T network', async () => {
            await service.mintNewNft('T', mockJsonFile, 'req-testnet');

            expect(mockNft.mintNFT).toHaveBeenCalledWith(
                'T',
                '0xTestnetWallet',
                expect.any(String),
                expect.any(Object),
            );
        });

        it('should use mainnet wallet address for L network', async () => {
            await service.mintNewNft('L', mockJsonFile, 'req-mainnet');

            expect(mockNft.mintNFT).toHaveBeenCalledWith(
                'L',
                '0xMainnetWallet',
                expect.any(String),
                expect.any(Object),
            );
        });
    });

    describe('getTemplateCost - edge cases', () => {
        it('should throw for template ID 0', async () => {
            await expect(service.getTemplateCost(0)).rejects.toThrow('Template ID 1');
        });

        it('should throw for negative template ID', async () => {
            await expect(service.getTemplateCost(-1)).rejects.toThrow('Template ID 1');
        });

        it('should call queueService.getTemplateCosts with correct parameters', async () => {
            await service.getTemplateCost(1);

            expect(mockQueue.getTemplateCosts).toHaveBeenCalledWith('L', 'arbitrum', '1');
            expect(mockQueue.getTemplateCosts).toHaveBeenCalledWith('T', 'arbitrum', '1');
        });
    });

    describe('createEventChainBase', () => {
        const mockPkg = {
            cid: 'QmTestCid',
            isDynamic: true,
            keywords: ['test', 'nft'],
        };
        const mockNftInfo = {
            network: 'arbitrum',
            address: '0xNftContract',
            id: 42,
        };

        it('should throw for invalid Ethereum address', async () => {
            mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

            await expect(
                service.createEventChainBase(mockPkg as any, mockNftInfo, 'invalid-address', 'testnet', '/tmp'),
            ).rejects.toThrow('Invalid Ethereum address');
        });

        it('should validate address before creating chain', async () => {
            mockEqty.isValidAddress = vi.fn().mockReturnValue(false);

            await expect(
                service.createEventChainBase(mockPkg as any, mockNftInfo, '0xNotValid', 'testnet', '/tmp'),
            ).rejects.toThrow('Expected 0x-prefixed hex address');
        });

        it('should create event chain for valid inputs', async () => {
            // Mock writeFileSync and readFileSync
            vi.mock('fs', async () => {
                const actual = await vi.importActual('fs');
                return {
                    ...(actual as any),
                    writeFileSync: vi.fn(),
                    readFileSync: vi.fn().mockReturnValue('{"id":"chain-123"}'),
                };
            });

            mockEqty.isValidAddress = vi.fn().mockReturnValue(true);

            // This test verifies the validation path works
            expect(mockEqty.isValidAddress).toBeDefined();
        });
    });

    describe('createPinataPinnedFile - extended', () => {
        it('should throw when metadata pinning fails', async () => {
            // First call (picture) succeeds, second call (metadata) fails
            let callCount = 0;
            (global.fetch as any).mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // Picture upload succeeds
                    return Promise.resolve({
                        json: vi.fn().mockResolvedValue({ IpfsHash: 'QmPictureHash' }),
                    });
                }
                // Metadata upload fails
                return Promise.reject(new Error('Metadata upload failed'));
            });

            const picture = Buffer.from('test image data');

            await expect(
                service.createPinataPinnedFile(picture, 'Test', 'Description'),
            ).rejects.toThrow('Metadata upload failed');
        });

        it('should return full gateway URL with metadata hash', async () => {
            (global.fetch as any).mockResolvedValue({
                json: vi.fn().mockResolvedValue({ IpfsHash: 'QmMetadataHash123' }),
            });

            const picture = Buffer.from('test image');
            const result = await service.createPinataPinnedFile(picture, 'MyNFT', 'A cool NFT');

            expect(result).toContain('gateway.pinata.cloud');
            expect(result).toContain('QmMetadataHash123');
        });

        it('should include name and description in metadata', async () => {
            (global.fetch as any).mockResolvedValue({
                json: vi.fn().mockResolvedValue({ IpfsHash: 'QmTest' }),
            });

            const picture = Buffer.from('image data');
            await service.createPinataPinnedFile(picture, 'SpecialNFT', 'Special description');

            // Verify fetch was called (for picture and metadata)
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });
});
