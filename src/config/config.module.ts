import { Module } from '@nestjs/common';
import {ConfigModule as NestConfigModule} from '@nestjs/config'
import { ConfigService } from './config.service';

@Module({
  imports: [NestConfigModule.forRoot({
    envFilePath: ['.env.local', '.env'],
    cache: true,
    expandVariables: true,
    isGlobal: true
  })],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
