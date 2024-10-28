import { Module } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { UploadZipController } from './upload-zip.controller';
import { ConfigModule } from '../common/config/config.module';
import { IpfsModule } from '../common/ipfs/ipfs.module';
import { JszipModule } from '../common/jszip/jszip.module';
import { HttpModule } from '@nestjs/axios';
import { LtoModule } from '../common/lto/lto.module';
import { NFTModule } from '../nft/nft.module';
import { QueueService } from '../services/Queue.service';
import { InfoService } from '../info/info.service';
import { InfoModule } from '../info/info.module';
import { RedisModule } from '../common/redis/redis.module';
import { RabbitMQModule } from '../common/rabbitmq/rabbitmq.module';
import { RedisService } from '../common/redis/redis.service';
import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';
import { BuildService } from './build.service';
import { FileService } from './file.service';
import { NftService } from './nft.service';
import { ConfigService } from '../common/config/config.service';

@Module({
  imports: [
    ConfigModule,
    IpfsModule,
    JszipModule,
    LtoModule,
    InfoModule,
    NFTModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      }),
    }),
    RedisModule,
    RabbitMQModule,
  ],
  providers: [
    UploadZipService,
    QueueService,
    InfoService,
    NftService,
    BuildService,
    FileService,
    ConfigService,
  ],
  controllers: [UploadZipController],
  exports: [UploadZipService, QueueService],
})
export class UploadZipModule {}
