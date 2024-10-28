import { Module } from '@nestjs/common';
import { DebuggerService } from './debugger.service';
import { DebuggerController } from './debugger.controller';
import { RedisModule } from '../common/redis/redis.module';
import { RedisService } from '../common/redis/redis.service';

@Module({
  imports: [RedisModule],
  providers: [DebuggerService, RedisService],
  controllers: [DebuggerController],
})
export class DebuggerModule {}
