import { Module } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { UploadZipController } from './upload-zip.controller';
import { ConfigModule } from '../common/config/config.module';
import { IpfsModule } from '../common/ipfs/ipfs.module';
import { JszipModule } from '../common/jszip/jszip.module';
import { HttpModule } from '@nestjs/axios';
import { LtoModule } from 'src/common/lto/lto.module';
import { NFTModule } from 'src/nft/nft.module';
import { QueueService } from '../services/Queue.service';
import { ConfigService } from '@nestjs/config';


@Module({
  imports: [
    ConfigModule, 
    IpfsModule, 
    JszipModule, 
    LtoModule,
    NFTModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      })
    }),
  ],
  providers: [UploadZipService, QueueService,ConfigService],
  controllers: [UploadZipController],
  exports: [UploadZipService, QueueService,ConfigService],
})
export class UploadZipModule { }
