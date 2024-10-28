import { Module } from '@nestjs/common';
import { InfoController } from './info.controller';
import { InfoService } from './info.service';
import { ConfigService } from '@nestjs/config';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule } from 'src/common/config/config.module';
import { NFTModule } from 'src/nft/nft.module';
import { LtoModule } from 'src/common/lto/lto.module';
import { RedisService } from '../common/redis/redis.service';
import { RedisModule } from '../common/redis/redis.module';

@Module({
  imports: [ConfigModule, HttpModule, NFTModule, LtoModule, RedisModule],
  controllers: [InfoController],
  providers: [InfoService, ConfigService, RedisService],
})
export class InfoModule {}
