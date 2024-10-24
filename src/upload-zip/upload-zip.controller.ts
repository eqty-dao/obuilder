import { Controller, Get, Header, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, ParseIntPipe, Res, Query, StreamableFile } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
// import { CreateUploadZipDto } from './dto/create-upload-zip.dto';
import { UpdateUploadZipDto } from './dto/update-upload-zip.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { Request, Response } from 'express';
import { InputUploadFileDto } from './dto/inputUploadFileDto.dto';
import { Account, EventChain } from '@ltonetwork/lto';
import { Signer } from '../common/http-signature/signer';
import { createReadStream } from 'fs';
import { AuthError, UserError, DataError } from '../interfaces/error';
import { QueueService } from '../services/Queue.service';
@Controller('api/v1')
export class UploadZipController {
  constructor(private readonly uploadZipService: UploadZipService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@Body() inputUploadFile: InputUploadFileDto, @UploadedFile() file: Express.Multer.File,@Res() res: Response, @Signer() signer?: Account): Promise<Response> {
    console.log("file.fieldname", file.fieldname);
    console.log("file.originalname", file.originalname);
    // console.log("inputUploadFile.name", inputUploadFile.name);
    // console.log("inputUploadFile.id", inputUploadFile.id);
    // console.log("inputUploadFile.nummer", inputUploadFile.nummer);
    // console.log("file.buffer",file.buffer);
    const buffer = file.buffer;
    if (!buffer || Object.getPrototypeOf(buffer) === null || Object.prototype.isPrototypeOf(buffer) == false) {
      return res.status(400).send('Failed to read data from HTTP request');     
    }

    let requestId: string;
    try {
      requestId = await this.uploadZipService.queueRequest(buffer, 1, signer, true);
      // requestId = await this.uploadZipService.store(buffer, 1, signer, true); // 1 == template 1 => TODO: make this a POST input variable for future
      return res.status(201).json(requestId);

    } catch (err) {
      return this.errorResponse(res, err);
      
    }

  }

  private errorResponse(res: Response, err: any) {
    if (err instanceof AuthError) return res.status(403) //.status(403).send(err.message);
    if (err instanceof UserError) return res.status(400).send(err.message);
    if (err instanceof DataError) return res.status(404).send(err.message);

    // console.error(err);
    return res.status(500).send(`Unexpected error: ${err.message}`);
  }
  @Get('getQueueRequestIDs')
  getQueueRequestIDs(@Res() res: Response) {
    const retVal = this.uploadZipService.getQueueRequestIDs();
    return res.status(201).json({QueueRequestIDs: retVal});
  }
  @Get('getQueueStatus')
  getQueueStatus(@Res() res: Response) {
    const retVal = this.uploadZipService.queueStatus();    
    return res.status(201).json(retVal);
  }
  @Get('isRelayServerUp')
  async isRelayServerUp(@Res() res: Response) {
    try {
      return await this.uploadZipService.isRelayServerUp();
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }
  @Get('isEVMAddress')
  isEVMAddress(@Query('address') address: string, @Res() res: Response) {
    try {
      return this.uploadZipService.isEVMAddress(address);      
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }
  @Get('isLTOAddress')
  isLTOAddress(@Query('address') address: string) {
    try {
      return this.uploadZipService.isValidLtoAddress(address);      
    } catch (err) {
      return false;
    }
  }
  
  @Get('availableChains')
  async GetAvailableNftChains(@Res() res: Response) {
    try {
      return await this.uploadZipService.getAvailableNftChains();
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }
  @Get('requestIDs')
  async getRequestIDs(@Res() res: Response,@Query('ltoUserAddress') ltoUserAddress?: string) {

    try {
      return await this.uploadZipService.getClaimableRequestIDs(ltoUserAddress)
    } catch (err) {
      return this.errorResponse(res, err);
    }

  }
  //needs additional Query parameter to get different costs for template 1,2,3...
  @Get('templateCost')
  templateCost(@Query('templateId') templateId: number, @Res() res: Response) {
    try {
      return this.uploadZipService.templateCost(templateId);
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }

  // @Get('claim/')
  // @Header('Content-type', 'application/zip')
  // async claim(
  //   @Query('requestId') requestId: string,
  //   @Signer() signer?: Account,
  // ): Promise<StreamableFile> {
  //   return await this.uploadZipService.claim(requestId, signer);
  // }

  @Get('ServerWalletAddressLTO')
  serverWalletAddressLTO(@Res() res: Response) {
    try {
      return { "serverWalletAddressLTO": `${this.uploadZipService.getServerLTOwalletAddress()}` }
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }

  @Get('GetServerInfo')
  async GetServerInfo(@Res() res: Response) {
    try {
      const [balanceETH, balanceARB] = await this.uploadZipService.GetServerETHBalance();
      const balanceLTO = await this.uploadZipService.getLTOAccountBalance();
      const serverLTOwallet = this.uploadZipService.getServerLTOwalletAddress()
      return {
        "ServerBalanceETH": balanceETH,
        "ServerBalanceARB": balanceARB,
        "ServerBalanceLTO": balanceLTO,
        "serverLTOwalletAddress": serverLTOwallet
      };
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }
 
}
