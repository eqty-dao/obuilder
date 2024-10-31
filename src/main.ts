import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './common/config/config.service';
import bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  // const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors({
    origin: '*',  // Allows requests from any origin
    methods: 'GET, POST, PUT, DELETE, OPTIONS',  // Allowed methods
    allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization',  // Allowed headers
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.use(bodyParser.json({}), bodyParser.urlencoded({ extended: false }));
  
  app.enableShutdownHooks();
  
  
  const packageInfo = require('../package.json');
  
  const options = new DocumentBuilder()
  .setTitle('LTO oBuilder')
  .setDescription(packageInfo.description)
  .setVersion(packageInfo.version)
  .addTag('Building Ownables and NFTs made easy')
  .addBearerAuth()
  .build();
  
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  // await app.listen(3001); // TODO For testing !

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
