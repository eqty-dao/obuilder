import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { QueueService } from './services/Queue.service';
// import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { LtoModule } from './common/lto/lto.module';
import { InfoModule } from './info/info.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UploadZipModule, 
    LtoModule, InfoModule, 
  ],
  controllers: [AppController],
  providers: [AppService, QueueService],
})
export class AppModule {
  // constructor(private dataSource: DataSource) { }
}
