import { Module } from '@nestjs/common';

import { LoggingModule } from '../logging/logging.module';
import { LtoModule } from '../lto/lto.module';
import { ConfigModule } from '../config/config.module';
import { QueueModule } from '../queue/queue.module';
import { RelayService } from './relay.service';

@Module({
  imports: [
    LoggingModule,
    LtoModule,
    ConfigModule,
    QueueModule,
  ],
  providers: [RelayService],
  exports: [RelayService],
})
export class RelayModule {}