import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { InfoDto } from './info-app.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiExcludeEndpoint()
  root(@Res() res: Response): void {
    res.redirect('/api');
  }

  @Get('info')
  getInfo(@Query('text') text: string, @Query('name') name: string): InfoDto {
    return this.appService.getInfo(text, name);
  }
}
