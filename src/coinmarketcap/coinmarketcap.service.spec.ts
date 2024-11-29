import { Test, TestingModule } from '@nestjs/testing';
import { CoinmarketcapService } from './coinmarketcap.service';

describe('CoinmarketcapService', () => {
  let service: CoinmarketcapService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoinmarketcapService],
    }).compile();

    service = module.get<CoinmarketcapService>(CoinmarketcapService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
