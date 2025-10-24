import { Module } from '@nestjs/common';
import { EqtyService } from './eqty.service';
import { ConfigModule } from '../config/config.module';
import { HttpModule } from '@nestjs/axios';
import { LoggingModule } from '../logging/logging.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [ConfigModule, HttpModule, LoggingModule, QueueModule],
  providers: [EqtyService],
  exports: [EqtyService],
})
export class EqtyModule {}
