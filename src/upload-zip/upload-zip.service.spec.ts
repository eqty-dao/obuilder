import { Test, TestingModule } from '@nestjs/testing';
import { UploadZipService } from './upload-zip.service';
import * as fs from 'fs';
import { FileManagementService } from '../file-management/file-management.service';
import { NFTService } from '../nft/nft.service';
import { LoggingService } from '../logging/logging.service';
import { ConfigService } from '../config/config.service';

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn()
  }
}));

describe('UploadZipService Template Features', () => {
  let service: UploadZipService;
  let fileManagementService: FileManagementService;
  
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadZipService,
        {
          provide: FileManagementService,
          useValue: {
            directoryExists: jest.fn(),
            fileExists: jest.fn()
          }
        },
        {
          provide: NFTService,
          useValue: {
            getTemplateCosts: jest.fn()
          }
        },
        {
          provide: LoggingService,
          useValue: {
            log: jest.fn(),
            logError: jest.fn()
          }
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        },
        // Mock other dependencies as needed
      ],
    }).compile();

    service = module.get<UploadZipService>(UploadZipService);
    fileManagementService = module.get<FileManagementService>(FileManagementService);
    
    // Setup paths
    service['pathToTemplates'] = '/mock/templates';
  });

  describe('getAvailableTemplateIds', () => {
    it('should return sorted template IDs', async () => {
      // Mock fs.readdir to return template directories
      (fs.promises.readdir as jest.Mock).mockResolvedValue([
        'template2', 'template1', 'template10', 'other-folder'
      ]);
      
      const result = await service['getAvailableTemplateIds']();
      
      expect(result).toEqual([1, 2, 10]);
      expect(fs.promises.readdir).toHaveBeenCalledWith('/mock/templates');
    });
    
    it('should return fallback values on error', async () => {
      // Mock fs.readdir to throw error
      (fs.promises.readdir as jest.Mock).mockRejectedValue(new Error('Directory not found'));
      
      const result = await service['getAvailableTemplateIds']();
      
      expect(result).toEqual([1, 2, 3]); // Default fallback values
    });
  });
  
  describe('validateTemplateId', () => {
    it('should return true when template exists', async () => {
      // Mock directoryExists to return true
      (fileManagementService.directoryExists as jest.Mock).mockResolvedValue(true);
      
      const result = await service['validateTemplateId'](2);
      
      expect(result).toBe(true);
      expect(fileManagementService.directoryExists).toHaveBeenCalledWith('/mock/templates/template2');
    });
    
    it('should return false when template does not exist', async () => {
      // Mock directoryExists to return false
      (fileManagementService.directoryExists as jest.Mock).mockResolvedValue(false);
      
      const result = await service['validateTemplateId'](999);
      
      expect(result).toBe(false);
    });
  });
  
  describe('getTemplateInfo', () => {
    it('should return template information', async () => {
      // Setup mocks
      jest.spyOn(service as any, 'getAvailableTemplateIds').mockResolvedValue([1, 2]);
      const nftService = module.get<NFTService>(NFTService);
      (nftService.getTemplateCosts as jest.Mock)
        .mockResolvedValueOnce({ mainnet: '0.1', testnet: '0.01' })
        .mockResolvedValueOnce({ mainnet: '0.2', testnet: '0.02' });
      
      const result = await service.getTemplateInfo();
      
      expect(result).toEqual({
        availableTemplates: [1, 2],
        templates: {
          1: {
            id: 1,
            name: 'Template 1',
            costs: { mainnet: '0.1', testnet: '0.01' }
          },
          2: {
            id: 2,
            name: 'Template 2',
            costs: { mainnet: '0.2', testnet: '0.02' }
          }
        }
      });
    });
  });
  
  describe('getTemplatePreview', () => {
    it('should return preview buffer when template exists', async () => {
      // Setup mocks
      (fileManagementService.directoryExists as jest.Mock).mockResolvedValue(true);
      (fileManagementService.fileExists as jest.Mock).mockResolvedValue(true);
      const previewBuffer = Buffer.from('mock image data');
      (fs.promises.readFile as jest.Mock).mockResolvedValue(previewBuffer);
      
      const result = await service.getTemplatePreview(1);
      
      expect(result).toEqual(previewBuffer);
    });
    
    it('should return null when template does not exist', async () => {
      // Setup mocks
      (fileManagementService.directoryExists as jest.Mock).mockResolvedValue(false);
      
      const result = await service.getTemplatePreview(999);
      
      expect(result).toBeNull();
    });
  });
});