import { Test, TestingModule } from '@nestjs/testing';
import { DebuggerService } from './debugger.service';

describe('DebuggerService', () => {
  let service: DebuggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DebuggerService],
    }).compile();

    service = module.get<DebuggerService>(DebuggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
