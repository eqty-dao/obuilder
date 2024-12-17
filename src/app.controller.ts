import { Controller, Get, Query, Res, Req } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { InfoDto } from './info-app.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
    @ApiExcludeEndpoint()
    root(@Req() req: Request, @Res() res: Response): void {
        // Check if it's a health check request
        if (req.headers['user-agent']?.includes('ELB-HealthChecker')) {
            res.status(200).send('OK');
        } else {
            res.redirect('/api');
        }
    }

  @Get('info')
  getInfo(@Query('text') text: string, @Query('name') name: string): InfoDto {
    return this.appService.getInfo(text, name);
  }
}
