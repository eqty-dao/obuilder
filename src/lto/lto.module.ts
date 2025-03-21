import { Module } from '@nestjs/common';
import { LtoService } from './lto.service';
import { ConfigModule } from '../config/config.module';
import { HttpModule } from '@nestjs/axios';
import { LoggingModule } from '../logging/logging.module';
import { QueueModule } from '../queue/queue.module';
@Module({
  imports: [
    HttpModule,
    ConfigModule,
	LoggingModule,
    QueueModule,
  ],
  providers: [LtoService], // Providing the necessary services
  exports: [LtoService], // Export if needed in other modules
})
export class LtoModule {}
