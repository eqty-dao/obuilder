import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './config/config.service';
// import { ConfigService } from '@nestjs/config';
import bodyParser from 'body-parser';
// Add this import at the top of the file
import * as path from 'path';
dotenv.config();  

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  // const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors({
    origin: '*',  // Allows requests from any origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Signature-Input', 'Signature'],
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.use(bodyParser.json({}), bodyParser.urlencoded({ extended: false }));
  
  app.enableShutdownHooks();
  
  console.log("test1");
  const packageInfo = require(path.join(__dirname, '../../package.json'));
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
  
  if(localTesting) {
    await app.listen(3001); // TODO For testing !
  }else {
    await app.listen(3000);

  }

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
