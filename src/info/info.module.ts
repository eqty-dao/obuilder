import { Module } from '@nestjs/common';
import { InfoController } from './info.controller';
import { InfoService } from './info.service';
import { ConfigService } from '@nestjs/config';
import { QueueService } from 'src/services/Queue.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import LTO from '@ltonetwork/lto';
import { ConfigModule } from 'src/common/config/config.module';
import { NFTModule } from 'src/nft/nft.module';
import { LtoModule } from 'src/common/lto/lto.module';

@Module({
  imports: [ConfigModule, HttpModule, NFTModule, LtoModule],
  controllers: [InfoController],
  providers: [InfoService, QueueService],
})
export class InfoModule {}
