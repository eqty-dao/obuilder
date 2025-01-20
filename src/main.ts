import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './config/config.service';
// import { ConfigService } from '@nestjs/config';
import bodyParser from 'body-parser';
import fs from 'fs';

dotenv.config();  

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  // const app = await NestFactory.create(AppModule);
  
  // Enhanced CORS configuration to match NGINX settings
  app.enableCors({
    origin: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'Accept',
      'Signature-Input',
      'Signature',
      'DNT',
      'User-Agent',
      'X-Requested-With',
      'If-Modified-Since',
      'Cache-Control',
      'Content-Type',
      'Range',
      'Authorization'
    ],
    exposedHeaders: ['Content-Length', 'Content-Range'],
    maxAge: 1728000,
  });

  app.use(
    bodyParser.json({ limit: '1024mb' }),
    bodyParser.urlencoded({ extended: false, limit: '1024mb' })
  );

  app.use((req, res, next) => {
    res.header('X-Real-IP', req.ip);
    res.header('X-Forwarded-For', req.ip);
    next();
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.enableShutdownHooks();
  
  console.log("test1");
  const packageInfo = require('../package.json');
  console.log("test2");
  
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
  
  const sslEnabled = config.get('ssl.enabled') || false;
  const port = sslEnabled ? 443 : 80;

  if (sslEnabled) {
    const httpsOptions = {
      key: fs.readFileSync(config.get('ssl.key')),
      cert: fs.readFileSync(config.get('ssl.cert'))
    };
    await app.listen(port, '0.0.0.0', httpsOptions);
  } else {
    await app.listen(port, '0.0.0.0');
  }

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
