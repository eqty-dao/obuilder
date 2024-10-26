import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InfoService } from './info.service';

@ApiTags('Info')
@Controller('info')
export class InfoController {
  constructor(private readonly infoService: InfoService) {}

  @Get('getQueueRequestIDs')
  getQueueRequestIDs() {
    const retVal = this.infoService.getQueueRequestIDs();
    return { QueueRequestIDs: retVal };
  }

  @Get('isRelayServerUp')
  async isRelayServerUp() {
    try {
      return await this.infoService.isRelayServerUp();
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('isEVMAddress')
  isEVMAddress(@Query('address') address: string) {
    try {
      return this.infoService.isEVMAddress(address);
    } catch (err) {
      return { error: `${err}` };
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

  @Get('availableChains')
  async GetAvailableNftChains() {
    try {
      return await this.infoService.getAvailableNftChains();
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('requestIDs')
  async getRequestIDs(@Query('ltoUserAddress') ltoUserAddress?: string) {
    try {
      return await this.infoService.getClaimableRequestIDs(ltoUserAddress);
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('templateCost')
  templateCost(@Query('templateId') templateId: number) {
    try {
      return this.infoService.templateCost(templateId);
    } catch (err) {
      return { error: `${err}` };
    }
  }

  @Get('ServerWalletAddressLTO')
  serverWalletAddressLTO() {
    try {
      return {
        serverWalletAddressLTO: `${this.infoService.getServerLTOwalletAddress()}`,
      };
    } catch (err) {
      return { error: `${err}` };
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
}
