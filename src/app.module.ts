import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { QueueService } from './services/Queue.service';
// import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { LtoModule } from './common/lto/lto.module';
import { VerifySignatureMiddleware } from './common/http-signature/verify-signature.middleware';
// import { ConfigService } from './common/config/config.service';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UploadZipModule, 
    LtoModule, 
  ],
  controllers: [AppController],
  providers: [AppService, QueueService, ConfigService],
  
})export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(VerifySignatureMiddleware).forRoutes({ path: 'api/v1/*', method: RequestMethod.ALL });
  // }
}
