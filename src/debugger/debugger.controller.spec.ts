import { Test, TestingModule } from '@nestjs/testing';
import { DebuggerController } from './debugger.controller';

describe('DebuggerController', () => {
  let controller: DebuggerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DebuggerController],
    }).compile();

    controller = module.get<DebuggerController>(DebuggerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
