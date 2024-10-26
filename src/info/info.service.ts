import { LTO, Account } from '@ltonetwork/lto';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../common/config/config.service';
import { NFTService } from '../nft/nft.service';
import { QueueService } from '../services/Queue.service';
import { mkdirSync, readFileSync, readdirSync } from 'fs';
import fileExists from '../utils/fileExists';
import { NftInfo } from '../interfaces/OwnableInfo';

@Injectable()
export class InfoService {
  private packageInfo: any;
  private readonly _ltoAccount?: Account = this.lto.account({
    seed: this.config.get('lto.account.seed'),
  });
  private pathToRids: string;
  private pathToCids: string;
  private pathToUserRids: string;
  private pathToUsedTxids: string;
  public readonly networkId = this.lto.networkId;

  constructor(
    private readonly queueService: QueueService,
    private readonly config: ConfigService,
    private readonly nft: NFTService,
    private readonly lto: LTO,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    this.packageInfo = require('../../package.json');
    this.pathToRids = this.packageInfo.ownableRidPath;
    this.pathToCids = this.packageInfo.ownableCidPath;
    this.pathToUserRids = this.packageInfo.userRidsPath;
    this.pathToUsedTxids = this.packageInfo.usedTxidsPath;
    mkdirSync(this.pathToRids, { recursive: true });
    mkdirSync(this.pathToCids, { recursive: true });
    mkdirSync(this.pathToUserRids, { recursive: true });
    mkdirSync(this.pathToUsedTxids, { recursive: true });
    // console.log("NODE", this.config.get('lto.node'));
    // console.log("NODE_ENV", this.config.get('env'));
    // this.intervalId = setInterval(() => {
    //   this.checkQueueStatus();
    // }, 10000); // 10000 ms = 10 seconds
  }

  public getQueueRequestIDs(): string[] {
    const isEmpty = this.queueService.isQueueEmpty();
    if (isEmpty) {
      return [];
    } else {
      return this.queueService.getRequestIdList();
    }
  }

  public getRelayUrl(): string {
    return this.config.get('lto.relay') || this.config.get('lto.local_relay');
  }

  private async isRelayUp(url: string | undefined): Promise<boolean> {
    if (!url) throw new Error(`Undefined relay URL in oBuilder`);
    try {
      const response = await fetch(url, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (e) {
      throw new Error(`Relay Server ${url} is down: ${e}`);
    }
  }

  public async isRelayServerUp(): Promise<string> {
    const relayURL = this.getRelayUrl();
    try {
      const isUp: boolean = await this.isRelayUp(relayURL);
      if (isUp) {
        return `SUCCESS: oRelay Server ${relayURL} is up and running!`;
      }
    } catch (error) {
      throw new Error(`Relay Server ${relayURL} is down: ${error}`);
    }
  }

  public isEVMAddress(address: string): boolean {
    return this.nft.isEVMAddress(address);
  }

  public isValidLtoAddress(address: string): boolean {
    return this.lto.isValidAddress(address);
  }

  public async getAvailableNftChains(): Promise<JSON> {
    const nftInfoETH: NftInfo = {
      network: 'ethereum',
      id: 0,
      address: this.config.get('eth.contracts.ethereum'),
    };

    const nftInfoARB: NftInfo = {
      network: 'arbitrum',
      id: 0,
      address: this.config.get('eth.contracts.arbitrum'),
    };

    // const nftInfoPOL: NFTInfo = {
    //   network: 'polygon',
    //   id: '0',
    //   address: this.config.get('eth.contracts.polygon'),
    // };

    const nftCountETH = await this.nft.getNFTcount(nftInfoETH);
    const nftCountARB = await this.nft.getNFTcount(nftInfoARB);
    // const nftCountPOL = await this.nft.getNFTcount(nftInfoPOL);

    const availableChains = {
      ethereum: {
        name: 'ethereum',
        logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/ethereum-eth-logo.png',
        smartContractAddress: this.config.get('eth.contracts.ethereum'),
        totalAmountNFTs: nftCountETH.toString(),
        templateCost: {
          1: this.packageInfo.templateCost.ethereum[1].toString(),
        },
      },
      arbitrum: {
        name: 'arbitrum',
        logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
        smartContractAddress: this.config.get('eth.contracts.arbitrum'),
        totalAmountNFTs: nftCountARB.toString(),
        templateCost: {
          1: this.packageInfo.templateCost.arbitrum[1].toString(),
        },
      },
    };

    return JSON.parse(JSON.stringify(availableChains));
  }

  public templateCost(templateId: number) {
    //console.log("templateId", templateId, "chain", chain, " cost: ", this.packageInfo.templateCost[chain][templateId]);
    // if (this.packageInfo.templateCost[chain.toString()][templateId] === undefined) {
    //   throw (`Undefined Template cost for template number ${templateId} and chain: ${chain}`);
    // }
    if (templateId != 1) {
      throw `Currently only Template ID 1 is support`;
    }
    return {
      ethereum: this.packageInfo.templateCost.ethereum[templateId].toString(),
      arbitrum: this.packageInfo.templateCost.arbitrum[templateId].toString(),
      //'polygon': (this.packageInfo.templateCost.polygon[templateId]).toString()
    };
  }
  public getLTOAccountAddress(): string {
    if (!!this._ltoAccount) return this._ltoAccount!.address;
    return '';
  }

  public getServerLTOwalletAddress(): string {
    return this.getLTOAccountAddress();
  }

  public async GetServerETHBalance(): Promise<[string, string]> {
    return await this.nft.getServerETHBalance();
  }

  public async getLTOAccountBalance(address?: string) {
    if (!address) address = this.getLTOAccountAddress();
    const url = `${this.config.get('lto.node')}/addresses/balance/${address}`;

    const data = await this.httpService.axiosRef
      .get(url)
      .then((res) => res.data)
      .catch((err) => {
        throw new Error(
          err?.message + ': ' + JSON.stringify(err?.response?.data),
        );
      });
    // console.log("data", data);
    return data;
    // const response = await fetch(url);
    // if (response.status == 200) {
    //   const data = await response.json();
    //   return data;
    // } else { throw new Error(`Error fetching balance of address: ${address}`) }
  }

  async getClaimableRequestIDs(ltoUserAddress: string): Promise<JSON[]> {
    let requestIDs: JSON[] = new Array();

    if (!(await fileExists(`${this.pathToUserRids}/${ltoUserAddress}`))) {
      throw `No entries for LTO user address: ${ltoUserAddress}`;
    }

    try {
      console.log(
        `Fetching available request IDs for LTO user address: ${ltoUserAddress}`,
      );
      const files = readdirSync(`${this.pathToUserRids}/${ltoUserAddress}/`);

      files.forEach((file) => {
        if (file.match(/_claimable$/g)) {
          requestIDs.push(
            JSON.parse(
              readFileSync(
                `${this.pathToUserRids}/${ltoUserAddress}/${file}`,
              ).toString(),
            ),
          );
        }
      });
    } catch (err) {
      console.log(err);
    }
    return requestIDs;
  }
}
