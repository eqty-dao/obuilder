import { Test, TestingModule } from '@nestjs/testing';
import { EthersService } from './ethers.service';
import { ConfigModule } from '../config/config.module';
import { ethers } from 'ethers';

describe('EthersService', () => {
  let service: EthersService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EthersService],
      imports: [ConfigModule],
    }).compile();

    service = module.get<EthersService>(EthersService);

    await module.init();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEVMAddress', () => {
    it('should return true for valid EVM address', () => {
      const validAddress = '0x1234567890123456789012345678901234567890';
      expect(service.isEVMAddress(validAddress)).toBe(true);
    });

    it('should return true for valid checksummed address', () => {
      const checksummedAddress = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
      expect(service.isEVMAddress(checksummedAddress)).toBe(true);
    });

    it('should return false for invalid EVM address', () => {
      const invalidAddress = 'not-an-address';
      expect(service.isEVMAddress(invalidAddress)).toBe(false);
    });

    it('should return false for short address', () => {
      const shortAddress = '0x1234';
      expect(service.isEVMAddress(shortAddress)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(service.isEVMAddress('')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw error for unsupported network in getNetwork', () => {
      expect(() => {
        // Access private method through bracket notation for testing
        (service as any).getNetwork('L', 'unsupported-network');
      }).toThrow('Unsupported EVM network');
    });

    it('should identify supported networks', () => {
      // These should not throw (though they will fail without config)
      // We're just testing that the switch statement doesn't throw for valid networks
      ['ethereum', 'arbitrum', 'polygon'].forEach(network => {
        try {
          (service as any).getNetwork('L', network);
        } catch (e: any) {
          // Expected to fail due to missing config, but not with "Unsupported EVM network"
          expect(e.message).not.toContain('Unsupported EVM network');
        }
      });
    });
  });
});
