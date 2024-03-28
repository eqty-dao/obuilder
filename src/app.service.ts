import { Injectable, OnModuleInit } from '@nestjs/common';
import { InfoDto } from './info-app.dto';

@Injectable()
export class AppService implements OnModuleInit {
  info = new InfoDto();

  onModuleInit(): void {
    
    const packageInfo = require('../package.json');

    this.info = {
      name: packageInfo.name,
      version: packageInfo.version,
      description: packageInfo.description,
      env: process.env['NODE_ENV'] || 'development',
    };
  }

  // getHello(): string {
  //   return 'Hello world';
  // }

  getInfo(text: string, name: string): InfoDto {
    if(text === undefined) console.log("text undefined");
    if(name === undefined) console.log("name undefined");
    console.log("text",text,"name",name)

    return this.info;
  }
}
