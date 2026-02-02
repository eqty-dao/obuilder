import { Test, TestingModule } from '@nestjs/testing';
import { NFTService } from './nft.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../config/config.service';

describe('NFTService', () => {
    let service: NFTService;

    const mockConfigService = {
        get: vi.fn().mockReturnValue('test-value'),
        load: vi.fn().mockResolvedValue(undefined),
    };

    const mockHttpService = {
        get: vi.fn(),
        post: vi.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NFTService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: HttpService, useValue: mockHttpService },
            ],
        }).compile();

        service = module.get<NFTService>(NFTService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
