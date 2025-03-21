import { Test, TestingModule } from '@nestjs/testing';
import { UploadZipController } from './upload-zip.controller';
import { UploadZipService } from './upload-zip.service';
import { Response } from 'express';
import { InputUploadFileDto } from '../dtos/input-upload-file.dto';

describe('UploadZipController', () => {
  let controller: UploadZipController;
  let service: UploadZipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadZipController],
      providers: [
        {
          provide: UploadZipService,
          useValue: {
            getTemplateInfo: jest.fn(),
            getTemplatePreview: jest.fn(),
            queueRequest: jest.fn()
          }
        }
      ],
    }).compile();

    controller = module.get<UploadZipController>(UploadZipController);
    service = module.get<UploadZipService>(UploadZipService);
  });

  describe('getTemplates', () => {
    it('should return template info', async () => {
      const mockTemplateInfo = {
        availableTemplates: [1, 2],
        templates: {
          1: { id: 1, name: 'Template 1' },
          2: { id: 2, name: 'Template 2' }
        }
      };
      
      (service.getTemplateInfo as jest.Mock).mockResolvedValue(mockTemplateInfo);
      
      const result = await controller.getTemplates();
      expect(result).toEqual(mockTemplateInfo);
    });
  });
  
  describe('getTemplatePreview', () => {
    it('should return template preview', async () => {
      const mockPreviewBuffer = Buffer.from('mock image data');
      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as unknown as Response;
      
      (service.getTemplatePreview as jest.Mock).mockResolvedValue(mockPreviewBuffer);
      
      await controller.getTemplatePreview('1', mockResponse);
      
      expect(service.getTemplatePreview).toHaveBeenCalledWith(1);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(mockResponse.send).toHaveBeenCalledWith(mockPreviewBuffer);
    });
    
    it('should return 404 when preview not found', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as unknown as Response;
      
      (service.getTemplatePreview as jest.Mock).mockResolvedValue(null);
      
      await controller.getTemplatePreview('1', mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Template preview not found' });
    });
  });
  
  describe('uploadFile', () => {
    it('should use templateId from body when provided', async () => {
      const mockRequest = {} as Request;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as unknown as Response;
      const mockFile = { buffer: Buffer.from('test') } as Express.Multer.File;
      const dto = new InputUploadFileDto();
      dto.templateId = 2;
      
      (service.queueRequest as jest.Mock).mockResolvedValue({ rid: 'test-rid' });
      
      await controller.uploadFile(dto, mockFile, mockRequest, mockResponse, 'L');
      
      expect(service.queueRequest).toHaveBeenCalledWith('L', expect.any(Uint8Array), mockRequest, 2);
    });
  });
});