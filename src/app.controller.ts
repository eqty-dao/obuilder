import { Controller, Get, Query, Res, Req } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InfoDto } from './info-app.dto';

@Controller()
export class AppController {
  private readonly startTime = new Date();

  constructor(private readonly appService: AppService) { }

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

  @Get('health')
  @ApiTags('Health')
  @ApiOperation({ summary: 'Health check endpoint for container orchestration' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  health() {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: `${uptime}s`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Get('info')
  getInfo(@Query('text') text: string, @Query('name') name: string): InfoDto {
    return this.appService.getInfo(text, name);
  }
}
