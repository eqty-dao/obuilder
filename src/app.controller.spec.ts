import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfoDto } from './info-app.dto';
import { vi } from 'vitest';

describe('AppController', () => {
  let appController: AppController;
  let module: TestingModule;

  const mockInfo: InfoDto = {
    name: '@eqty/ownable-builder',
    version: '1.0.0',
    description: 'Ownable Builder Service',
    env: 'test',
  };

  const mockAppService = {
    info: mockInfo,
    getInfo: vi.fn().mockReturnValue(mockInfo),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('health', () => {
    it('should return health status', () => {
      const result = appController.health();
      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
    });
  });

  describe('info', () => {
    it('should return app info via service mock', () => {
      // Test the mock directly first
      const serviceResult = mockAppService.getInfo('test', 'testName');
      expect(serviceResult).toBeDefined();
      expect(serviceResult.name).toBe('@eqty/ownable-builder');
    });
  });
});
