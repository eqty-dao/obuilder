import { Controller, Get, Post, Body, UseInterceptors, UploadedFile, Res, Req, Query, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UploadZipService } from './upload-zip.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { InputUploadFileDto } from './dto/inputUploadFileDto.dto';
import { SignerAddress } from '../decorators/signer.decorator';
import { AuthError, UserError, DataError } from '../interfaces/error';
import { OwnableStatus } from 'src/interfaces/QueueEntry';
import { } from 'multer';

@ApiTags('Building Ownables and NFTs made easy')
@Controller('api/v1')
export class UploadZipController {
  private readonly logger = new Logger(UploadZipController.name);

  constructor(private readonly uploadZipService: UploadZipService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Body() inputUploadFile: InputUploadFileDto,
    @UploadedFile() file: any,
    @Req() req: Request,
    @Res() res: Response,
    @Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet',
    @SignerAddress() signerAddress?: string): Promise<Response> {
    let buffer: Buffer = null;
    this.logger.debug(`Upload request received: ${file?.originalname}`);

    if (!file || Object.getPrototypeOf(file) === null || Object.prototype.isPrototypeOf(file) == false) {
      this.logger.warn('Invalid file buffer in request');
      return res.status(400).send('Failed to read data from HTTP request');
    }

    buffer = file.buffer;

    // Map legacy 'L'/'T' to 'mainnet'/'testnet' for backwards compatibility
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';

    let requestId: string;
    try {
      requestId = await this.uploadZipService.queueRequest(ltoNetworkId, buffer, 1, req);
      return res.status(201).json(requestId);
    } catch (err) {
      return this.errorResponse(res, err);
    }
  }

  private errorResponse(res: Response, err: any) {
    if (err instanceof AuthError) return res.status(403);
    if (err instanceof UserError) return res.status(400).send(err.message);
    if (err instanceof DataError) return res.status(404).send(err.message);

    this.logger.error(`Unexpected error: ${err.message}`);
    return res.status(500).send(`Unexpected error: ${err.message}`);
  }

  @Get('getLogsByRequestId')
  getLogsByRequestId(@Query('requestId') requestId: string) {
    return this.uploadZipService.getLogsByRequestId(requestId);
  }

  @Get('getInQueueEntries')
  getInQueueEntries(@Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return this.uploadZipService.getInQueueEntries(ltoNetworkId);
  }

  @Get('getProcessingEntries')
  getProcessingEntries(@Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return this.uploadZipService.getProcessingEntries(ltoNetworkId);
  }

  @Get('getReadyEntries')
  getReadyEntries(@Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return this.uploadZipService.getReadyEntries(ltoNetworkId);
  }

  @Get('getSentEntries')
  getSentEntries(@Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return this.uploadZipService.getSentEntries(ltoNetworkId);
  }

  @Get('getQueueEntriesByRequestId')
  getQueueEntriesByRequestId(@Query('requestId') requestId: string, @Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return this.uploadZipService.getQueueEntriesByRequestId(ltoNetworkId, requestId);
  }

  @Get('getQueueEntriesByWallet')
  getQueueEntriesByWallet(@Query('wallet') wallet: string) {
    return this.uploadZipService.getQueueEntriesByWallet(wallet.toString());
  }

  @Get('getQueueEntriesByStatus')
  getQueueEntriesByStatus(@Query('status') status: OwnableStatus, @Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return this.uploadZipService.getQueueEntriesByStatus(ltoNetworkId, status);
  }

  @Get('resendOwnableByRequestId')
  async resendOwnableByRequestId(@Query('requestId') requestId: string, @Query('networkType') networkType: 'mainnet' | 'testnet' = 'mainnet') {
    const ltoNetworkId = networkType === 'mainnet' ? 'L' : 'T';
    return await this.uploadZipService.resendOwnableByRequestId(ltoNetworkId, requestId);
  }

  @Get('getQueueStatus')
  getQueueStatus() {
    return this.uploadZipService.queueStatus();
  }

  @Get('isRelayServerUp')
  async isRelayServerUp() {
    try {
      return await this.uploadZipService.isRelayServerUp();
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('isEVMAddress')
  isEVMAddress(@Query('address') address: string) {
    try {
      return this.uploadZipService.isEVMAddress(address);
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('isValidAddress')
  isValidAddress(@Query('address') address: string) {
    try {
      return this.uploadZipService.isValidAddress(address);
    } catch (err) {
      return false;
    }
  }

  @Get('availableChains')
  async GetAvailableNftChains() {
    try {
      return await this.uploadZipService.getAvailableNftChains();
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('templateCost')
  async templateCost(@Query('templateId') templateId: number) {
    try {
      return await this.uploadZipService.templateCost(templateId);
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('ServerWalletAddresses')
  getServerWalletAddresses() {
    try {
      const [serverWalletAddressMainnet, serverWalletAddressTestnet] = this.uploadZipService.getServerWalletAddresses();
      return {
        serverWalletAddress_mainnet: serverWalletAddressMainnet,
        serverWalletAddress_testnet: serverWalletAddressTestnet
      };
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('GetServerInfo')
  async GetServerInfo() {
    try {
      const balanceARB_mainnet = await this.uploadZipService.GetServerETHBalance('L', 'arbitrum');
      const balanceARB_testnet = await this.uploadZipService.GetServerETHBalance('T', 'arbitrum');
      const balanceEQTY_mainnet = await this.uploadZipService.getEqtyBalance('mainnet');
      const balanceEQTY_testnet = await this.uploadZipService.getEqtyBalance('testnet');
      const [serverWalletMainnet, serverWalletTestnet] = this.uploadZipService.getServerWalletAddresses();
      const [serverEvmWalletMainnet, serverEvmWalletTestnet] = this.uploadZipService.getServerEVMwalletAddresses('arbitrum');

      this.logger.debug('Server info fetched', {
        balanceARB_mainnet,
        balanceARB_testnet,
        balanceEQTY_mainnet,
        balanceEQTY_testnet
      });

      return {
        ServerBalanceARB_mainnet: balanceARB_mainnet,
        ServerBalanceARB_testnet: balanceARB_testnet,
        ServerBalanceEQTY_mainnet: balanceEQTY_mainnet,
        ServerBalanceEQTY_testnet: balanceEQTY_testnet,
        serverWalletAddress_mainnet: serverWalletMainnet,
        serverWalletAddress_testnet: serverWalletTestnet,
        serverEvmWalletAddress_mainnet: serverEvmWalletMainnet,
        serverEvmWalletAddress_testnet: serverEvmWalletTestnet
      };
    } catch (err) {
      this.logger.error(`GetServerInfo failed: ${err}`);
      return { error: `${err}` };
    }
  }
}
