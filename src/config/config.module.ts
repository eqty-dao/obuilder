import { Module } from '@nestjs/common';
import { ConfigService } from './config.service';

@Module({
  providers: [
    {
      provide: ConfigService,
      useFactory: async () => {
        const service = new ConfigService();
        await service.load();
        return service;
      },
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
