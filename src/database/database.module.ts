import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
  //   TypeOrmModule.forRootAsync({
  //   useFactory: (configService: ConfigService) => ({
  //     type: 'mysql',
  //     host: configService.getOrThrow('MYSQL_HOST'),
  //     port: configService.getOrThrow('MYSQL_PORT'),
  //     database: configService.getOrThrow('MYSQL_DATABASE'),
  //     username: configService.getOrThrow('MYSQL_USER'),
  //     password: configService.getOrThrow('MYSQL_PASSWORD'),
  //     autoLoadEntities: true,
  //     entities: [],
  //     synchronize: configService.getOrThrow('MYSQL_SYNCHRONIZE'),
  //   }),
  //   inject: [ConfigService],
  // })
],
  controllers: [],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
