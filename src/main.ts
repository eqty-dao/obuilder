import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { ConfigService } from './config/config.service';
// import { ConfigService } from '@nestjs/config';
import bodyParser from 'body-parser';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  // const app = await NestFactory.create(AppModule);

  // Enable CORS with allowed origins from environment
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['https://eqty.io', 'https://app.eqty.io'];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Signature-Input', 'Signature', 'X-EQTY-Signature', 'X-EQTY-Message', 'X-EQTY-Chain-Id'],
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.use(bodyParser.json({}), bodyParser.urlencoded({ extended: false }));

  app.enableShutdownHooks();

  Logger.log('Starting application...');
  const packageInfo = require('../package.json');
  Logger.log(`Package version: ${packageInfo.version}`);

  const options = new DocumentBuilder()
    .setTitle('EQTY oBuilder')
    .setDescription(packageInfo.description)
    .setVersion(packageInfo.version)
    .addTag('Building Ownables and NFTs made easy')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  const localTesting = config.get('bucket.localTesting');

  if (localTesting) {
    await app.listen(3001); // TODO For testing !
  } else {
    await app.listen(3000);

  }

  Logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
