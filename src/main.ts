import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './common/config/config.service';
import bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const config = await app.get<ConfigService>(ConfigService);
  await config.load();

  app.setGlobalPrefix('api/v1');

  app.use((req, res, next) => {
    if (req.path === '/') {
      return res.redirect('/api/v1/docs');
    }
    next();
  });

  app.enableCors();

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

  SwaggerModule.setup('api/v1/docs', app, document);

  await app.listen(4000);

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
