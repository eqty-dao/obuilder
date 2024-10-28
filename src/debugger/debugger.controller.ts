import { Controller, Get, Param, Res } from '@nestjs/common';
import { DebuggerService } from './debugger.service';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Debugger')
@Controller('debugger')
export class DebuggerController {
  constructor(private readonly debuggerService: DebuggerService) {}

  @Get(':requestId')
  async getRequestStatus(
    @Param('requestId') requestId: string,
    @Res() res: Response,
  ) {
    try {
      const requestInfo =
        await this.debuggerService.getRequestStatus(requestId);
      return res.status(200).json(requestInfo);
    } catch (error) {
      return res.status(404).json({ error: 'Request ID not found' });
    }
  }
}
