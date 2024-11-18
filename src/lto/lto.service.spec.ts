import { Test, TestingModule } from '@nestjs/testing';
import { LtoService } from './lto.service';

describe('LtoService', () => {
  let service: LtoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LtoService],
    }).compile();

    service = module.get<LtoService>(LtoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
