import { Module } from '@nestjs/common';
import { PinataService } from './pinata.service';
import { ConfigModule } from '../config/config.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
  ],
  providers: [PinataService],
  exports: [PinataService],
})
export class PinataModule {}