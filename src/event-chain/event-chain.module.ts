import { Module } from '@nestjs/common';
import { LoggingModule } from '../logging/logging.module';
import { EqtyModule } from '../eqty/eqty.module';
import { FileManagementModule } from '../file-management/file-management.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { EventChainService } from './event-chain.service';

@Module({
  imports: [LoggingModule, EqtyModule, FileManagementModule, TelegramBotModule],
  providers: [EventChainService],
  exports: [EventChainService],
})
export class EventChainModule {}
