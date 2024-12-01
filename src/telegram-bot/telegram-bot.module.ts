import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [TelegramBotService],
  exports: [TelegramBotService]
})
export class TelegramBotModule {}
