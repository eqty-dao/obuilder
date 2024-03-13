import { Test, TestingModule } from '@nestjs/testing';
import { UploadZipController } from './upload-zip.controller';
import { UploadZipService } from './upload-zip.service';

describe('UploadZipController', () => {
  let controller: UploadZipController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadZipController],
      providers: [UploadZipService],
    }).compile();

    controller = module.get<UploadZipController>(UploadZipController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
