import { Module } from '@nestjs/common';
import { WhitelistService } from './whitelist.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
  ],
  providers: [WhitelistService],
  exports: [WhitelistService],
})
export class WhitelistModule {} 