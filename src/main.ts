import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './config/config.service';
import bodyParser from 'body-parser';
import * as path from 'path';
import { QueueService } from './queue/queue.service';
dotenv.config();  

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  
  // Enable CORS configuration
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Signature-Input', 'Signature'],
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.use(bodyParser.json({}), bodyParser.urlencoded({ extended: false }));
  
  app.enableShutdownHooks();
  
  // Important: Ensure queue is fully loaded before starting the server
  const queueService = app.get<QueueService>(QueueService);
  console.log("Ensuring queue is fully initialized...");
  
  // Package.json loading
  let packageInfo;
  try {
    packageInfo = require(path.join(__dirname, '../../package.json'));
    console.log("Loaded package.json from ../../package.json");
  } catch (e) {
    try {
      packageInfo = require(path.join(__dirname, '../package.json'));
      console.log("Loaded package.json from ../package.json");
    } catch (e) {
      packageInfo = { 
        name: 'LTO oBuilder', 
        description: 'Building Ownables and NFTs made easy',
        version: '0.0.0' 
      };
      console.warn('Unable to load package.json, using fallback values');
    }
  }
  
  const options = new DocumentBuilder()
    .setTitle('LTO oBuilder')
    .setDescription(packageInfo.description)
    .setVersion(packageInfo.version)
    .addTag('Building Ownables and NFTs made easy')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);
  
  const localTesting = config.get('bucket.localTesting');
  
  if(localTesting) {
    await app.listen(3001);
  } else {
    await app.listen(3000);
  }

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
