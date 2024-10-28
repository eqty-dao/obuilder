import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InfoService } from './info.service';

@ApiTags('Info')
@Controller('info')
export class InfoController {
  constructor(private readonly infoService: InfoService) {}

  @Get('getQueueRequestIDs')
  async getQueueRequestIDs() {
    try {
      const requestIDs = await this.infoService.getQueueRequestIDs();
      return { data: { QueueRequestIDs: requestIDs } };
    } catch (err) {
      return { error: `${err.message}` };
    }
  }

  @Get('GetServerInfo')
  async GetServerInfo() {
    try {
      const [balanceETH, balanceARB] =
        await this.infoService.GetServerETHBalance();
      const balanceLTO = await this.infoService.getLTOAccountBalance();
      const serverLTOwallet = this.infoService.getServerLTOwalletAddress();
      return {
        ServerBalanceETH: balanceETH,
        ServerBalanceARB: balanceARB,
        ServerBalanceLTO: balanceLTO,
        serverLTOwalletAddress: serverLTOwallet,
      };
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('isRelayServerUp')
  async isRelayServerUp() {
    try {
      const result = await this.infoService.isRelayServerUp();
      return { data: result };
    } catch (err) {
      return { error: `${err.message}` };
    }
  }

  @Get('isLTOAddress')
  isLTOAddress(@Query('address') address: string) {
    try {
      return this.infoService.isValidLtoAddress(address);
    } catch (err) {
      return false;
    }
  }

  @Get('isEVMAddress')
  async isEVMAddress(@Query('address') address: string) {
    try {
      const isEVM = await this.infoService.isEVMAddress(address);
      return { data: { isEVMAddress: isEVM } };
    } catch (err) {
      return { error: `${err.message}` };
    }
  }

  @Get('templateCost')
  async templateCost(@Query('templateId') templateId: number) {
    try {
      const cost = this.infoService.templateCost(templateId);
      console.log(cost);
      return { data: { templateCost: cost } };
    } catch (err) {
      return { error: `${err.message}` };
    }
  }

  @Get('ServerWalletAddressLTO')
  async serverWalletAddressLTO() {
    try {
      const address = this.infoService.getLTOAccountAddress();
      return { data: { serverWalletAddressLTO: address } };
    } catch (err) {
      return { error: `${err.message}` };
    }
  }

  @Get('availableChains')
  async GetAvailableNftChains() {
    try {
      return await this.infoService.getAvailableNftChains();
    } catch (err) {
      return { error: `${err}` };
    }
  }
}
