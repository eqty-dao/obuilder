import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EqtyService } from './eqty.service';
import { ConfigService } from '../config/config.service';
import { IEqtyFactory, IMessage, IRelay, ISigner } from './eqty.interfaces';

// Mock eqty-core (still needed for EventChain, Event, AnchorClient)
vi.mock('eqty-core', () => ({
    EventChain: {
        create: vi.fn().mockReturnValue({ id: 'mock-chain-id', anchorMap: [] }),
    },
    Event: vi.fn().mockImplementation((data) => ({
        data,
        addTo: vi.fn(),
        signWith: vi.fn().mockResolvedValue(undefined),
    })),
    Message: vi.fn().mockImplementation((content) => ({
        content,
        to: vi.fn(),
        signWith: vi.fn().mockResolvedValue(undefined),
        isSigned: vi.fn().mockReturnValue(true),
        hash: { base58: 'mock-hash', hex: '0xmockhash' },
    })),
    Relay: vi.fn().mockImplementation(() => ({
        send: vi.fn().mockResolvedValue({ success: true }),
    })),
    AnchorClient: {
        contractAddress: vi.fn().mockReturnValue('0x1234567890123456789012345678901234567890'),
        ABI: [],
    },
}));

// Mock ethers
vi.mock('ethers', () => ({
    JsonRpcProvider: vi.fn().mockImplementation(() => ({
        getBalance: vi.fn().mockResolvedValue(BigInt(1000000000000000000)),
    })),
    Wallet: vi.fn().mockImplementation((key, provider) => ({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
        signTypedData: vi.fn().mockResolvedValue('0xsignature'),
        provider,
    })),
    Contract: vi.fn().mockImplementation(() => ({
        anchor: vi.fn().mockResolvedValue({ hash: '0xtxhash' }),
    })),
}));

/**
 * Create a mock message that conforms to IMessage interface
 */
function createMockMessage(): IMessage {
    return {
        to: vi.fn(),
        signWith: vi.fn().mockResolvedValue(undefined),
        isSigned: vi.fn().mockReturnValue(true) as () => boolean,
        hash: { base58: 'mock-hash', hex: '0xmockhash' },
    };
}

/**
 * Create a mock relay that conforms to IRelay interface
 */
function createMockRelay(): IRelay {
    return {
        send: vi.fn().mockResolvedValue({ success: true }),
    };
}

/**
 * Create a mock factory for testing
 */
function createMockFactory(): IEqtyFactory {
    return {
        createMessage: vi.fn().mockImplementation(() => createMockMessage()),
        createRelay: vi.fn().mockImplementation(() => createMockRelay()),
    };
}

describe('EqtyService', () => {
    let service: EqtyService;
    let mockConfig: Partial<ConfigService>;
    let mockFactory: IEqtyFactory;

    beforeEach(() => {
        mockConfig = {
            load: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockImplementation((path: string) => {
                const config: Record<string, any> = {
                    'eqty.rpc.mainnet': 'https://mainnet.base.org',
                    'eqty.rpc.testnet': 'https://sepolia.base.org',
                    'eqty.privateKey.mainnet': 'a'.repeat(64),
                    'eqty.privateKey.testnet': 'b'.repeat(64),
                    'eqty.relayUrl': 'https://relay.eqty.io',
                };
                return config[path];
            }),
        };

        mockFactory = createMockFactory();
        service = new EqtyService(mockConfig as ConfigService, mockFactory);
    });

    describe('Initialization', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should initialize on module init', async () => {
            await service.onModuleInit();
            expect(mockConfig.load).toHaveBeenCalled();
        });

        it('should handle missing mainnet private key', async () => {
            mockConfig.get = vi.fn().mockReturnValue(undefined);
            await service.onModuleInit();
            expect(service.getAddress('mainnet')).toBe('');
        });

        it('should handle missing testnet private key', async () => {
            mockConfig.get = vi.fn().mockReturnValue(undefined);
            await service.onModuleInit();
            expect(service.getAddress('testnet')).toBe('');
        });
    });

    describe('Address Validation (isValidAddress)', () => {
        it('should validate correct Ethereum address', () => {
            expect(service.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(true);
        });

        it('should reject address without 0x prefix', () => {
            expect(service.isValidAddress('742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(false);
        });

        it('should reject address with wrong length (too short)', () => {
            expect(service.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1')).toBe(false);
        });

        it('should reject address with wrong length (too long)', () => {
            expect(service.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD155')).toBe(false);
        });

        it('should reject address with non-hex characters', () => {
            expect(service.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bDGH')).toBe(false);
        });

        it('should reject empty string', () => {
            expect(service.isValidAddress('')).toBe(false);
        });

        it('should reject null-like values', () => {
            expect(service.isValidAddress(null as any)).toBe(false);
            expect(service.isValidAddress(undefined as any)).toBe(false);
        });

        it('should validate zero address', () => {
            expect(service.isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
        });

        it('should validate lowercase address', () => {
            expect(service.isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f2bd15')).toBe(true);
        });

        it('should validate uppercase address', () => {
            expect(service.isValidAddress('0x742D35CC6634C0532925A3B844BC9E7595F2BD15')).toBe(true);
        });
    });

    describe('Network ID', () => {
        it('should return mainnet chain ID', () => {
            expect(service.getNetworkId('mainnet')).toBe(8453);
        });

        it('should return testnet chain ID', () => {
            expect(service.getNetworkId('testnet')).toBe(84532);
        });
    });

    describe('LTO Network Mapping (ltoNetworkToEqty)', () => {
        it('should map L to mainnet', () => {
            expect(service.ltoNetworkToEqty('L')).toBe('mainnet');
        });

        it('should map T to testnet', () => {
            expect(service.ltoNetworkToEqty('T')).toBe('testnet');
        });
    });

    describe('Get Address', () => {
        it('should return empty string when wallet not configured', () => {
            expect(service.getAddress('mainnet')).toBe('');
        });

        it('should return wallet address after initialization', async () => {
            await service.onModuleInit();
            const address = service.getAddress('mainnet');
            expect(address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        });
    });

    describe('Get Balance', () => {
        it('should throw when provider not configured', async () => {
            await expect(service.getBalance('mainnet')).rejects.toThrow('Provider not configured');
        });

        it('should return balance after initialization', async () => {
            await service.onModuleInit();
            const balance = await service.getBalance('mainnet');
            expect(balance).toBe(BigInt(1000000000000000000));
        });
    });

    describe('Event Chain Operations', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should create event chain for mainnet', () => {
            const chain = service.createEventChain('mainnet');
            expect(chain).toBeDefined();
            expect(chain.id).toBeDefined();
        });

        it('should create event chain for testnet', () => {
            const chain = service.createEventChain('testnet');
            expect(chain).toBeDefined();
        });

        it('should create event chain with custom address', () => {
            const chain = service.createEventChain('mainnet', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
            expect(chain).toBeDefined();
            expect(chain.id).toBeDefined();
        });

        it('should create event with object data', () => {
            const event = service.createEvent({ test: 'data' });
            expect(event).toBeDefined();
            expect(event.data).toBeDefined();
        });

        it('should create event with custom media type', () => {
            const event = service.createEvent('binary data', 'application/octet-stream');
            expect(event).toBeDefined();
        });
    });

    describe('Message Operations', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should create message', () => {
            const message = service.createMessage('Hello World');
            expect(message).toBeDefined();
        });

        it('should create message with object content', () => {
            const message = service.createMessage({ key: 'value' });
            expect(message).toBeDefined();
        });

        it('should reject invalid recipient in signMessage', async () => {
            const message = service.createMessage('test');
            await expect(
                service.signMessage(message, 'invalid-address', 'mainnet')
            ).rejects.toThrow('Invalid recipient address');
        });

        it('should throw when signer not configured', async () => {
            const newService = new EqtyService(mockConfig as ConfigService);
            const message = newService.createMessage('test');
            await expect(
                newService.signMessage(message, '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15', 'mainnet')
            ).rejects.toThrow('No signer configured');
        });
    });

    describe('Relay Operations', () => {
        it('should create relay with default URL', () => {
            const relay = service.createRelay();
            expect(relay).toBeDefined();
        });

        it('should create relay with custom URL', () => {
            const relay = service.createRelay('https://custom-relay.io');
            expect(relay).toBeDefined();
        });
    });

    describe('Anchor Operations', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should throw when anchor client not configured', async () => {
            const newService = new EqtyService(mockConfig as ConfigService);
            const chain = { anchorMap: [] };
            await expect(newService.anchorChain(chain, 'mainnet')).rejects.toThrow('No anchor client configured');
        });

        it('should throw when anchoring hash without client', async () => {
            const newService = new EqtyService(mockConfig as ConfigService);
            const hash = new Uint8Array(32);
            await expect(newService.anchorHash(hash, 'mainnet')).rejects.toThrow('No anchor client configured');
        });
    });

    describe('Signer Access', () => {
        it('should return null when signer not configured', () => {
            expect(service.getSigner('mainnet')).toBeNull();
        });

        it('should return signer after initialization', async () => {
            await service.onModuleInit();
            expect(service.getSigner('mainnet')).not.toBeNull();
        });
    });

    // ============================================
    // Phase 2: Additional Tests for 85% Coverage
    // ============================================

    // Note: signMessage, sendViaRelay, createAndSendMessage tests require
    // real eqty-core integration due to complex signature encoding.
    // Skipped as they fail with mock wallet signature format.

    describe('signMessage (extended)', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should sign message with valid recipient', async () => {
            const message = service.createMessage('Hello');
            const validRecipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

            const result = await service.signMessage(message, validRecipient, 'mainnet');

            expect(result).toBeDefined();
            expect(message.to).toHaveBeenCalledWith(validRecipient);
            expect(message.signWith).toHaveBeenCalled();
        });

        it('should sign message for testnet', async () => {
            const message = service.createMessage({ data: 'test' });
            const validRecipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

            const result = await service.signMessage(message, validRecipient, 'testnet');

            expect(result).toBeDefined();
        });
    });

    describe('sendViaRelay', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should throw if message not signed', async () => {
            const message = service.createMessage('test');
            message.isSigned = vi.fn().mockReturnValue(false);

            await expect(service.sendViaRelay(message)).rejects.toThrow('Message must be signed');
        });

        it('should send signed message via relay', async () => {
            const message = service.createMessage('test');

            const result = await service.sendViaRelay(message);

            expect(result).toBeDefined();
        });

        it('should send via custom relay URL', async () => {
            const message = service.createMessage('test');

            const result = await service.sendViaRelay(message, 'https://custom-relay.example.com');

            expect(result).toBeDefined();
        });
    });

    describe('createAndSendMessage', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should create, sign, and send message', async () => {
            const recipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

            const result = await service.createAndSendMessage('Hello', recipient, 'mainnet');

            expect(result).toBeDefined();
            expect(result.message).toBeDefined();
            expect(result.hash).toBeDefined();
        });

        it('should handle object content', async () => {
            const recipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

            const result = await service.createAndSendMessage(
                { type: 'ownable', data: 'test' },
                recipient,
                'testnet'
            );

            expect(result.message).toBeDefined();
            expect(typeof result.hash).toBe('string');
        });

        it('should handle Uint8Array content', async () => {
            const recipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';
            const binaryContent = new Uint8Array([1, 2, 3, 4]);

            const result = await service.createAndSendMessage(
                binaryContent,
                recipient,
                'mainnet',
                undefined,
                'application/octet-stream'
            );

            expect(result.message).toBeDefined();
        });

        it('should use custom relay URL', async () => {
            const recipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15';

            const result = await service.createAndSendMessage(
                'test content',
                recipient,
                'mainnet',
                'https://custom-relay.io'
            );

            expect(result.message).toBeDefined();
        });
    });

    describe('anchorChain (extended)', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should anchor chain to mainnet', async () => {
            const chain = { anchorMap: [{ hash: 'test' }] };

            const result = await service.anchorChain(chain, 'mainnet');

            expect(result).toBeDefined();
        });

        it('should anchor chain to testnet', async () => {
            const chain = { anchorMap: [] };

            const result = await service.anchorChain(chain, 'testnet');

            expect(result).toBeDefined();
        });
    });

    describe('anchorHash (extended)', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should anchor hash to mainnet', async () => {
            const hash = new Uint8Array(32).fill(0xAB);

            const result = await service.anchorHash(hash, 'mainnet');

            expect(result).toBeDefined();
        });

        it('should anchor hash to testnet', async () => {
            const hash = new Uint8Array(32).fill(0xCD);

            const result = await service.anchorHash(hash, 'testnet');

            expect(result).toBeDefined();
        });
    });

    describe('getBalance (extended)', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should get balance for testnet', async () => {
            const balance = await service.getBalance('testnet');
            expect(balance).toBe(BigInt(1000000000000000000));
        });
    });
});

