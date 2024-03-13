import { Test, TestingModule } from '@nestjs/testing';
import { UploadZipService } from './upload-zip.service';

describe('UploadZipService', () => {
  let service: UploadZipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadZipService],
    }).compile();

    service = module.get<UploadZipService>(UploadZipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
