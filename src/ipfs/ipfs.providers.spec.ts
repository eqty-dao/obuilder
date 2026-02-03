import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipfsProviders } from './ipfs.providers';
import { ConfigService } from '../config/config.service';

// Mock ipfs-core
vi.mock('ipfs-core', () => ({
    create: vi.fn().mockResolvedValue({
        add: vi.fn(),
        cat: vi.fn(),
        pin: { add: vi.fn() },
    }),
}));

describe('IPFS Providers', () => {
    let mockConfig: Partial<ConfigService>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockConfig = {
            load: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockReturnValue({ repo: './ipfs-test' }),
        };
    });

    it('should export an array of providers', () => {
        expect(Array.isArray(ipfsProviders)).toBe(true);
        expect(ipfsProviders.length).toBe(1);
    });

    it('should have IPFS provider with correct provide token', () => {
        const ipfsProvider = ipfsProviders[0];
        expect(ipfsProvider).toHaveProperty('provide', 'IPFS');
    });

    it('should have useFactory function', () => {
        const ipfsProvider = ipfsProviders[0] as any;
        expect(ipfsProvider).toHaveProperty('useFactory');
        expect(typeof ipfsProvider.useFactory).toBe('function');
    });

    it('should inject ConfigService', () => {
        const ipfsProvider = ipfsProviders[0] as any;
        expect(ipfsProvider).toHaveProperty('inject');
        expect(ipfsProvider.inject).toContain(ConfigService);
    });

    it('should call config.load() when factory is invoked', async () => {
        const ipfsProvider = ipfsProviders[0] as any;

        await ipfsProvider.useFactory(mockConfig as ConfigService);

        expect(mockConfig.load).toHaveBeenCalled();
    });

    it('should call config.get("ipfs") when factory is invoked', async () => {
        const ipfsProvider = ipfsProviders[0] as any;

        await ipfsProvider.useFactory(mockConfig as ConfigService);

        expect(mockConfig.get).toHaveBeenCalledWith('ipfs');
    });

    it('should return IPFS instance from factory', async () => {
        const ipfsProvider = ipfsProviders[0] as any;

        const result = await ipfsProvider.useFactory(mockConfig as ConfigService);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('add');
        expect(result).toHaveProperty('cat');
    });
});
