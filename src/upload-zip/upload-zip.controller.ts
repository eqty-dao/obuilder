import { Controller, Get, Post, Body, UseInterceptors, UploadedFile, Res, Req, Query } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { Request, Response } from 'express';
import { InputUploadFileDto } from './dto/inputUploadFileDto.dto';
import { Account, EventChain } from '@ltonetwork/lto';
import { Signer } from '../common/http-signature/signer';
import { AuthError, UserError, DataError } from '../interfaces/error';
import { QueueEntry, OwnableStatus } from 'src/interfaces/QueueEntry';
import { } from 'multer';

@Controller('api/v1')
export class UploadZipController {
  constructor(private readonly uploadZipService: UploadZipService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Body() inputUploadFile: InputUploadFileDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Res() res: Response,
    @Query('ltoNetworkId') ltoNetworkId: 'L'|'T',
	// @Query('nftUrl') nftUrl?: string,
    @Signer() signer?: Account): Promise<Response> {
    let buffer: Buffer = null;
    console.log("file", file);
    console.log("typeof file", typeof file);

    if (file) {
      console.log("file.fieldname", file.fieldname);
      console.log("file.originalname", file.originalname);
    }
    // console.log("inputUploadFile.name", inputUploadFile.name);
    // console.log("inputUploadFile.id", inputUploadFile.id);
    // console.log("inputUploadFile.nummer", inputUploadFile.nummer);
    // console.log("file.buffer",file.buffer);
    console.log("buffer", file.buffer);
    console.log("typeof buffer", typeof file.buffer);

    if (Object.getPrototypeOf(file) === null || Object.prototype.isPrototypeOf(file) == false) { //Buffer.isBuffer(file)) {
      console.log('The variable is NOT a Buffer object.');
      return res.status(400).send('Failed to read data from HTTP request');

    } else {
      console.log('The variable is a Buffer object.');
      buffer = file.buffer;
    }

    // if (typeof signer === 'undefined') {
    //   console.log(`Error: Request not signed by any signer. Sign url request and a add it to the header`);
    //   // throw new ForbiddenException({ message: 'Unauthorized: Invalid signature for this address' });
    //   // throw ('Undefined HTTP Authentication SIGNER LTO Wallet Address!');
    // } else {
    //   console.log(`Signer address ${signer.address} for request detected`);
    // }


    let requestId: string;
    try {
      requestId = await this.uploadZipService.queueRequest(ltoNetworkId, buffer, 1, req);
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
  @Get('getLogsByRequestId')
  getLogsByRequestId(@Query('requestId') requestId: string) {
    return this.uploadZipService.getLogsByRequestId(requestId);
  }
  @Get('getInQueueEntries')
  getInQueueEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return this.uploadZipService.getInQueueEntries(ltoNetworkId);
  }
  @Get('getProcessingEntries')
  getProcessingEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return this.uploadZipService.getProcessingEntries(ltoNetworkId);
  }
  @Get('getReadyEntries')
  getReadyEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return this.uploadZipService.getReadyEntries(ltoNetworkId);
  }
  @Get('getSentEntries')
  getSentEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return this.uploadZipService.getSentEntries(ltoNetworkId);
  }
  @Get('getQueueEntriesByRequestId')
  getQueueEntriesByRequestId(@Query('requestId') requestId: string, @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return this.uploadZipService.getQueueEntriesByRequestId(ltoNetworkId, requestId);
  }
  @Get('getQueueEntriesByWallet')
  getQueueEntriesByWallet(@Query('wallet') wallet: string) {
    return this.uploadZipService.getQueueEntriesByWallet(wallet.toString());
  }
  @Get('getQueueEntriesByStatus')
  getQueueEntriesByStatus(@Query('status') status: OwnableStatus, @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return this.uploadZipService.getQueueEntriesByStatus(ltoNetworkId, status);
  }
  
  @Get('resendOwnableByRequestId')
  async resendOwnableByRequestId(@Query('requestId') requestId: string, @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
    return await this.uploadZipService.resendOwnableByRequestId(ltoNetworkId, requestId);
  }

  @Get('getQueueStatus')
  getQueueStatus() {
    const retVal = this.uploadZipService.queueStatus();
    return retVal;
  }

  @Get('isRelayServerUp')
  async isRelayServerUp() {
    try {
      return await this.uploadZipService.isRelayServerUp();
    } catch (err) {
      return { "error": `${err}` };
    }
  }
  @Get('isEVMAddress')
  isEVMAddress(@Query('address') address: string) {
    try {
      return this.uploadZipService.isEVMAddress(address);
    } catch (err) {
      return { "error": `${err}` };
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
  async GetAvailableNftChains() {
    try {
      return await this.uploadZipService.getAvailableNftChains();
    } catch (err) {
      return { "error": `${err}` };
    }
  }
  // @Get('requestIDs')
  // async getRequestIDs(@Query('ltoUserAddress') ltoUserAddress?: string) {

  //   try {
  //     return await this.uploadZipService.getClaimableRequestIDs(ltoUserAddress)
  //   } catch (err) {
  //     return { "error": `${err}` };
  //   }

  // }
  //needs additional Query parameter to get different costs for template 1,2,3...
  @Get('templateCost')
  async templateCost(@Query('templateId') templateId: number) {
    try {
      return await this.uploadZipService.templateCost(templateId);
    } catch (err) {
      return { "error": `${err}` };
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

  @Get('ServerLtoWalletAddresses')
  getServerLtoWalletAddresses() {
    try {
      const [serverWalletAddressLTO_L, serverWalletAddressLTO_T] = this.uploadZipService.getServerLtoWalletAddresses();
      return {
        "serverLtoWalletAddress_L": serverWalletAddressLTO_L,
        "serverLtoWalletAddress_T": serverWalletAddressLTO_T
      }
    } catch (err) {
      return { "error": `${err}` };
    }
  }

  @Get('GetServerInfo')
  async GetServerInfo() {
    try {
      const balanceARB_L = await this.uploadZipService.GetServerETHBalance('L', 'arbitrum');
      const balanceARB_T = await this.uploadZipService.GetServerETHBalance('T', 'arbitrum');
      const balanceLTO_L = await this.uploadZipService.getLTOAccountBalance('L');
      const balanceLTO_T = await this.uploadZipService.getLTOAccountBalance('T');
      console.log("balanceARB_T", balanceARB_T);
      console.log("balanceARB_L", balanceARB_L);
      console.log("balanceLTO_L", balanceLTO_L);
      console.log("balanceLTO_T", balanceLTO_T);
      const [serverWalletAddressLTO_L, serverWalletAddressLTO_T] = this.uploadZipService.getServerLtoWalletAddresses();
      console.log("serverWalletAddressLTO_L", serverWalletAddressLTO_L);
      console.log("serverWalletAddressLTO_T", serverWalletAddressLTO_T);
      const [serverWalletAddressEVM_L, serverWalletAddressEVM_T] = this.uploadZipService.getServerEVMwalletAddresses('arbitrum');
      console.log("serverWalletAddressEVM_L", serverWalletAddressEVM_L);
      console.log("serverWalletAddressEVM_T", serverWalletAddressEVM_T);
      return {		
        "ServerBalanceARB_L": balanceARB_L,
        "ServerBalanceARB_T": balanceARB_T,
        "ServerBalanceLTO_L": balanceLTO_L,
        "ServerBalanceLTO_T": balanceLTO_T,
        "serverLtoWalletAddress_L": serverWalletAddressLTO_L,
        "serverLtoWalletAddress_T": serverWalletAddressLTO_T,
        "serverEvmWalletAddress_L": serverWalletAddressEVM_L,
        "serverEvmWalletAddress_T": serverWalletAddressEVM_T
      };
    } catch (err) {
      return { "error": `${err}` };
    }
  }

}
