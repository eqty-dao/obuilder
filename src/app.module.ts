// import { Module } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { UploadZipModule } from './upload-zip/upload-zip.module';
// import { QueueService } from './services/Queue.service';
// // import { TypeOrmModule } from '@nestjs/typeorm';
// import { ConfigModule } from '@nestjs/config';
// import { LtoModule } from './common/lto/lto.module';
// import { InfoModule } from './info/info.module';
// import { DebuggerModule } from './debugger/debugger.module';
// import { RedisModule } from './common/redis/redis.module';
// import { RabbitMQModule } from './common/rabbitmq/rabbitmq.module';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true }),
//     UploadZipModule,
//     LtoModule,
//     InfoModule,
//     DebuggerModule,
//     RedisModule,
//     RabbitMQModule,
//   ],
//   controllers: [AppController],
//   providers: [AppService, QueueService],
// })
// export class AppModule {
//   // constructor(private dataSource: DataSource) { }
// }

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { ConfigModule } from './common/config/config.module';
import { LtoModule } from './common/lto/lto.module';
import { InfoModule } from './info/info.module';
import { DebuggerModule } from './debugger/debugger.module';
import { RedisModule } from './common/redis/redis.module';
import { RabbitMQModule } from './common/rabbitmq/rabbitmq.module';
import { ConfigService } from './common/config/config.service';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule,
    UploadZipModule,
    InfoModule,
    DebuggerModule,
    RedisModule,
    RabbitMQModule,
    LtoModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService],
})
export class AppModule {}
