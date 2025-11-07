import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './config/config.service';
import bodyParser from 'body-parser';
import * as path from 'path';
import { RedisQueueService } from './queue/redis-queue.service';
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Enable CORS configuration
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'X-API-Key',
      'Content-Type',
      'Accept',
      'Authorization',
      'Signature-Input',
      'Signature',
    ],
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.use(
    bodyParser.json({ limit: '128mb' }),
    bodyParser.urlencoded({ extended: false, limit: '128mb' }),
  );

  app.enableShutdownHooks();

  // Important: Ensure queue is fully loaded before starting the server
  const queueService = app.get<RedisQueueService>(RedisQueueService);
  console.log('Ensuring queue is fully initialized...');

  // Package.json loading
  let packageInfo;
  try {
    packageInfo = require(path.join(__dirname, '../../package.json'));
    console.log('Loaded package.json from ../../package.json');
  } catch (e) {
    try {
      packageInfo = require(path.join(__dirname, '../package.json'));
      console.log('Loaded package.json from ../package.json');
    } catch (e) {
      packageInfo = {
        name: 'EQTY oBuilder',
        description: 'Building Ownables and NFTs made easy with Base',
        version: '0.0.0',
      };
      console.warn('Unable to load package.json, using fallback values');
    }
  }

  const options = new DocumentBuilder()
    .setTitle('EQTY oBuilder')
    .setDescription(packageInfo.description)
    .setVersion(packageInfo.version)
    .addTag('Building Ownables and NFTs made easy')
    // Add API key security scheme
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API key for authentication',
      },
      'X-API-Key', // This is the key to be used in @ApiSecurity() decorator
    )
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
