import { Module } from '@nestjs/common';
import { RedisMonitoringController } from './redis-monitoring.controller';
import { RedisModule } from './redis.module';
import { LoggingModule } from '../logging/logging.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [RedisModule, LoggingModule, QueueModule],
  controllers: [RedisMonitoringController],
})
export class RedisMonitoringModule {}
