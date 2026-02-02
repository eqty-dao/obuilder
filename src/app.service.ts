import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InfoDto } from './info-app.dto';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  info = new InfoDto();

  onModuleInit(): void {
    try {
      const packageInfo = require('../package.json');

      this.info = {
        name: packageInfo.name,
        version: packageInfo.version,
        description: packageInfo.description,
        env: process.env['NODE_ENV'] || 'development',
      };
    } catch (err) {
      // Fallback for test environment where package.json may not be resolvable
      this.logger.warn('Could not load package.json, using defaults');
      this.info = {
        name: '@eqty/ownable-builder',
        version: '1.0.0',
        description: 'Ownable Builder Service',
        env: process.env['NODE_ENV'] || 'development',
      };
    }
  }


  getInfo(text: string, name: string): InfoDto {
    if (text === undefined) this.logger.warn('text undefined');
    if (name === undefined) this.logger.warn('name undefined');
    this.logger.debug(`getInfo called with text: ${text}, name: ${name}`);

    return this.info;
  }
}
