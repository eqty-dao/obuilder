import { Module } from '@nestjs/common';
import { LtoService } from './lto.service';
import { ConfigService } from '../config/config.service';
import { ConfigModule } from '../config/config.module';
import { HttpModule, HttpService } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule,
    ConfigModule, 
  ],
  providers: [LtoService], // Providing the necessary services
  exports: [LtoService], // Export if needed in other modules
})
export class LtoModule {}
