import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import arrayToString from '../utils/arrayToString';
import JSZip from 'jszip';
import fileExists from '../utils/fileExists';
import path from 'path';
// import { catchError, firstValueFrom } from 'rxjs';
// import { AxiosError } from 'axios';
import { Account, LTO, Event, EventChain, Message, Relay, getNetwork } from "@ltonetwork/lto";
import { exec } from 'child_process';
// import chokidar from 'chokidar';
import { NftInfo, OwnableInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { TypedPackage } from "../interfaces/TypedPackage";
import { IEventChainJSON } from '@ltonetwork/lto/interfaces';
import { Blob } from 'buffer';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { PinataSDK } from "pinata";
import sharp, { Sharp } from "sharp";
import { Request, Response } from 'express';
import { sign, verify } from '@ltonetwork/http-message-signatures';

import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';
import { NFTService } from 'src/nft/nft.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { UserError } from 'src/interfaces/error';
import { QueueService } from 'src/queue/queue.service';
import { LoggingService } from 'src/logging/logging.service';
import { LtoService } from 'src/lto/lto.service';

@Injectable()
export class UploadZipService implements OnModuleInit, OnModuleDestroy {
  private pathToRids: string;
  private pathToCids: string;
  private pathToTemplates: string;
  private packageInfo: any;
  private intervalId: NodeJS.Timeout;
  
  private nodeVersion = process.version;
  private pinata: PinataSDK;
  private telegramBotToken:string;
  private telegramBotChannelId_L:string;
  private telegramBotChannelId_T:string;



  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly ltoService: LtoService,
    private readonly nft: NFTService,
    private readonly queueService: QueueService,
    private readonly loggingService: LoggingService,
    private readonly telegramService: TelegramBotService,
    @Inject('IPFS') private readonly ipfs: IPFS,
  ) { 
    
  }

  async onModuleInit() {
    await this.config.load();
  
    this.pinata = new PinataSDK({
      pinataJwt: this.config.get('pinata.jwt'), // process.env.PINATA_JWT!,
      pinataGateway: this.config.get('pinata.gateway') // "example-gateway.mypinata.cloud",
    });
    this.packageInfo = require('../../package.json');
    this.pathToRids = this.packageInfo.ownableRidPath;
    this.pathToCids = this.packageInfo.ownableCidPath;
    this.pathToTemplates = this.packageInfo.ownableTemplatesPath;
    mkdirSync(this.pathToRids, { recursive: true });
    mkdirSync(this.pathToCids, { recursive: true });
    this.intervalId = setInterval(async () => {
      try {
        await this.checkQueueStatus();
      }
      catch (err) {
        console.log(`ERROR QUEUE STATUS: ${err}`);
      }
    }, 15000); // 10000 ms = 10 seconds
  }

  // Stop the interval when the application shuts down
  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }


  public async GetServerETHBalance(ltoNetworkId: 'L' | 'T'): Promise<[string, string]> {
    const [balanceETH, balanceARB] = await this.nft.getServerETHBalance(ltoNetworkId);

    await this.telegramService.sendMessageToTelegramBot('T', `\nethereum: ${balanceETH}\narbitrum: ${balanceARB}`);

    return [balanceETH, balanceARB];
  }
  public getLTOAccountAddress(ltoNetworkId: 'L' | 'T'): string {
    // return ltoNetworkId === 'L' 
    //     ? this.ltoService.ltoAccountMainnet?.address 
    //     : this.ltoService.ltoAccountTestnet?.address;
    return this.ltoService.getLTOAccountAddress(ltoNetworkId);

  }
  public isEVMAddress(address: string): boolean {
    return this.nft.isEVMAddress(address);
  }
  public isValidLtoAddress(address: string): string {
    const isValidMainnet = this.ltoService.ltoMainnet.isValidAddress(address);
    const isValidTestnet = this.ltoService.ltoTestnet.isValidAddress(address);
    if (isValidMainnet) return "L";
    if (isValidTestnet) return "T";
    return "false";
  }
  public async getLTOAccountBalance(ltoNetworkId: 'L' | 'T') {
    const address = this.getLTOAccountAddress(ltoNetworkId);
    console.log("address1", address);
    let url: string;
    if (ltoNetworkId === 'L') {
      url = `${this.config.get('lto.node.mainnet')}/addresses/balance/${address}`;
    } else {
      url = `${this.config.get('lto.node.testnet')}/addresses/balance/${address}`;

    }

    console.log("url1", url)

    const data = await this.httpService.axiosRef
      .get(url)
      .then((res) => res.data)
      .catch((err) => {
        throw new Error(
          err?.message + ': ' + JSON.stringify(err?.response?.data),
        );
      });
    console.log("data1", data)
    return data;
  }
  public async sendFile(relay: any, content: Uint8Array, sender: Account, recipient: string, rid: string) {
    try {
      let message: Message;


      if (sender && recipient) {
        message = new Message(content).to(recipient).signWith(sender);
        // console.log("message.hash.base58",message.hash.base58);
        // console.log("message.hash.hex",message.hash.hex);

        //DONE
        await relay.send(message);
        this.loggingService.log(rid, `Ownable successfully sent to Relay. Setting Queue status to sent.`);
        const ltoNetwork = getNetwork(recipient);
        if (ltoNetwork === 'L') {
          await this.queueService.setQueueEntryStatus('L', rid, OwnableStatus.Sent, message.hash.base58);
        }
        else {
          await this.queueService.setQueueEntryStatus('T', rid, OwnableStatus.Sent, message.hash.base58);

        }
      } else {
        this.loggingService.logError(rid, `Provide the signer and recipient. signer: ${sender.address}  recipient:${recipient}`);        
        return;
      }


    } catch {
      return true;
    }
  }

  public getLogsByRequestId(requestId: string): { rid: string, level: string, message: string, timestamp: Date }[] {
    return this.loggingService.getLogsByRid(requestId);
  }

  private getRelayUrl(): string {
    return this.config.get('lto.relay') || this.config.get('lto.local_relay');
  }

  private async isRelayUp(url: string | undefined): Promise<boolean> {

    if (!url)
      throw new Error(`Undefined relay URL in oBuilder`);
    try {
      const response = await fetch(url, {
        method: "HEAD",
      });
      return response.ok;
    } catch (e) {
      throw new Error(`Relay Server ${url} is down: ${e}`);
    }
  }

  public async isRelayServerUp(): Promise<string> {
    const relayURL = this.getRelayUrl();
    // const relayURL = this.config.get('lto.relay');

    try {
      const isUp: boolean = await this.isRelayUp(relayURL);
      if (isUp) {
        return `SUCCESS: oRelay Server ${relayURL} is up and running!`;
      }
    } catch (error) {
      throw new Error(`Relay Server ${relayURL} is down: ${error}`);
    }
  }
  public async sendOwnable(ltoNetworkId: 'L' | 'T', rid: string, recipient: string, content?: Uint8Array) {
    const relayURL = this.getRelayUrl();
    let relay: Relay;
    let sender: Account;

    const ltoNetworkIdRecipient = getNetwork(recipient);
    this.loggingService.log(rid, `Sending Ownablefile...  RELAY:${relayURL} SENDER:${sender.address} RECIPIENT:${recipient} RID:${rid} NETWORKID: ${ltoNetworkId}.`);
    if (ltoNetworkId !== ltoNetworkIdRecipient) {
      this.loggingService.logError(rid, `Lto NetworkIds of currently produced Ownable ${ltoNetworkId} and recipient ${ltoNetworkIdRecipient} do not match`);
      throw new Error(`Lto NetworkIds of currently produced Ownable ${ltoNetworkId} and recipient ${ltoNetworkIdRecipient} do not match`);
    }

    if (ltoNetworkId == 'L') {
      this.ltoService.ltoMainnet.relay = new Relay(`${relayURL}`);
      relay = this.ltoService.ltoMainnet.relay;
      sender = this.ltoService.ltoAccountMainnet;
    } else if (ltoNetworkId == 'T') {
      this.ltoService.ltoTestnet.relay = new Relay(`${relayURL}`);
      relay = this.ltoService.ltoTestnet.relay;
      sender = this.ltoService.ltoAccountTestnet;
    } else {
      this.loggingService.logError(rid, `Unknown ltoNetworkID ${ltoNetworkId}`);
      throw new Error(`Unknown ltoNetworkID ${ltoNetworkId}`);
    }
    // const relay = new Relay('http://relay-dev.eba-zrdkspxn.eu-west-1.elasticbeanstalk.com');

    try {
      this.loggingService.log(rid, `Try sending file...  RELAY:${relay} RELAYURL:${relayURL} SENDER:${sender.address} RECIPIENT:${recipient} RID:${rid}.`);
      if (recipient) {
        await this.sendFile(relay, content, sender, recipient, rid);
      } else {
        this.loggingService.logError(rid, `Failed to send Ownable RELAY:${relay} SENDER:${sender.address} RECIPIENT:${recipient} RID:${rid}.`);
        throw new Error("No recipient provided");
      }
    } catch (error) {
      throw new Error(`Error sending message: ${error}`);
    }
  }

  private async checkReuseOfTxId(ltoTransactionId: string, requestId: string) {
    this.loggingService.log(requestId, `Checking if TX ID ${ltoTransactionId} has already been used for a previous request`);
    const [previousRequestId, networkID] = this.queueService.getRequestIdByTxId(ltoTransactionId);
    // DONE
    if (previousRequestId != null && previousRequestId !== requestId) {
      this.loggingService.logError(requestId, `LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId} on LTO network ${networkID}`);
      throw (`LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId} on LTO network ${networkID}`);
    }
  }

  private async checkLtoTransactionId(ltoNetworkId: 'L' | 'T', ltoTransactionId: string, templateId: number, chain: string, requestId: string): Promise<TransactionIdData> {
    // FIRST WORKING METHOD
    let url: string;
    if (ltoNetworkId === 'L') {
      url = `${this.config.get('lto.node.mainnet')}/transactions/info/${ltoTransactionId}`;
    } else {
      url = `${this.config.get('lto.node.testnet')}/transactions/info/${ltoTransactionId}`;
    }
    this.loggingService.log(requestId, `HTTP Request sent to: ${url} on LTO network ${ltoNetworkId}`);
    // const data = await this.httpService.axiosRef
    //   .get(url)
    //   .then((res) => res.data)
    //   .catch((err) => {
    //     throw new Error(
    //       err?.message + ': ' + JSON.stringify(err?.response?.data),
    //     );
    //   });
    // SECOND WORKING METHOD
    // const { data } = await firstValueFrom(
    //   this.httpService.get(url).pipe(
    //     catchError((error: AxiosError) => {
    //       //this.logger.error(error.response.data);
    //       throw 'An error happened!';
    //     }),
    //   ),
    // );

    // THIRD WORKING METHOD - requires node >= v18
    let data: any;
    try {
      const response = await fetch(url);
      data = await response.json();
      this.loggingService.log(requestId, `Request Done. Data: ${JSON.stringify(data)}`);
      if (data.status === 'error') {
        this.loggingService.logError(requestId, `Request Failed. Data details: ${data.details}`);
        throw new Error(data.details);
      }
    } catch (err) {
      this.loggingService.logError(requestId, `Request Failed with error: ${err}`);
      throw new Error(err);
    }

    // Must be of type "transaction"
    if (data.type != 4) {
      this.loggingService.logError(requestId, `Wrong Transaction type: ${data.type}`);
      throw new Error('Wrong Transaction type');
    }
    const templateCosts: string = this.queueService.getTemplateCosts(ltoNetworkId, chain.toString(), templateId.toString());

    if (templateCosts === undefined) {
      this.loggingService.logError(requestId, `Undefined templateCost for chain ${chain}`);
      throw new Error(`Undefined templateCost for chain ${chain}`);
    }

    this.loggingService.log(requestId, `data.fee: ${data.fee.toString()}`);
    this.loggingService.log(requestId, `data.amount: ${data.amount.toString()}`);
    this.loggingService.log(requestId, `Template Cost: ${templateCosts}`);

    if (data.amount.toString() !== templateCosts) {
      // console.log("templateCost", templateCosts);
      // console.log("amount sent", data.amount.toString());
      this.loggingService.logError(requestId, `Sent wrong LTO amount: ${data.amount.toString()} Correct amount should be: ${templateCosts}`);
      throw new Error(`Sent wrong LTO amount: ${data.amount.toString()} Correct amount should be: ${templateCosts}`);
    }

    let thisServerAddress = this.getLTOAccountAddress(ltoNetworkId);
    if (data.recipient != thisServerAddress) {
      this.loggingService.logError(requestId, `Wrong recipient address: ${data.recipient}! Use Server LTO Wallet address: ${thisServerAddress}`);
      throw new Error('Wrong recipient! Use Server LTO Wallet address');
    }
    try {
      await this.checkReuseOfTxId(ltoTransactionId, requestId);
    } catch (err) {
      this.loggingService.logError(requestId, `Check reuse of TxID failed: ${err}`);
      throw new Error(`Check reuse of TxID failed: ${err}`);
    }

    return {
      type: data.type,
      sender: data.sender,
      recipient: data.recipient,
      amount: data.amount,
    };
  }

  public async getAvailableNftChains(): Promise<JSON> {
    const nftInfoETH_L: NftInfo = {
      network: 'ethereum',
      id: 0,
      address: this.config.get('eth.contracts.ethereum.mainnet'),
    };

    const nftInfoARB_L: NftInfo = {
      network: 'arbitrum',
      id: 0,
      address: this.config.get('eth.contracts.arbitrum.mainnet'),
    };
    const nftInfoETH_T: NftInfo = {
      network: 'ethereum',
      id: 0,
      address: this.config.get('eth.contracts.ethereum.testnet'),
    };

    const nftInfoARB_T: NftInfo = {
      network: 'arbitrum',
      id: 0,
      address: this.config.get('eth.contracts.arbitrum.testnet'),
    };


    // const nftCountETH_L = await this.nft.getNFTcount('L', nftInfoETH_L);
    // const nftCountARB_L = await this.nft.getNFTcount('L', nftInfoARB_L);
    const nftCountETH_T = await this.nft.getNFTcount('T', nftInfoETH_T);
    const nftCountARB_T = await this.nft.getNFTcount('T', nftInfoARB_T);
    // const nftCountPOL = await this.nft.getNFTcount(nftInfoPOL);

    const availableChains = {
      ethereum: {
        // mainnet: {
        //   name: 'ethereum',
        //   logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/ethereum-eth-logo.png',
        //   smartContractAddress: this.config.get('eth.contracts.ethereum.mainnet'),
        //   totalAmountNFTs: nftCountETH_L.toString(),
        //   templateCost: {
        //     1: this.queueService.getTemplateCosts('L','ethereum', '1')
        //   }
        // },
        testnet: {
          name: 'ethereum',
          logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/ethereum-eth-logo.png',
          smartContractAddress: this.config.get('eth.contracts.ethereum.testnet'),
          totalAmountNFTs: nftCountETH_T.toString(),
          templateCost: {
            1: this.queueService.getTemplateCosts('T', 'ethereum', '1')
          }
        }
      },
      arbitrum: {
        // mainnet: {
        //   name: 'arbitrum',
        //   logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
        //   smartContractAddress: this.config.get('eth.contracts.arbitrum.mainnet'),
        //   totalAmountNFTs: nftCountARB_L.toString(),
        //   templateCost: {
        //     1: this.queueService.getTemplateCosts('L','arbitrum', '1')
        //   }
        // },
        testnet: {
          name: 'arbitrum',
          logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
          smartContractAddress: this.config.get('eth.contracts.arbitrum.testnet'),
          totalAmountNFTs: nftCountARB_T.toString(),
          templateCost: {
            1: this.queueService.getTemplateCosts('T', 'arbitrum', '1')
          }
        }
      }
    };

    return JSON.parse(JSON.stringify(availableChains));
  }


  private async createEventChain(pkg: TypedPackage, nftInfo: NftInfo, receiver: string): Promise<Buffer> {
    const ltoNetworkId = getNetwork(receiver);
    let ltoAccount: Account;

    if (ltoNetworkId === 'L') {
      ltoAccount = this.ltoService.ltoAccountMainnet;
    } else {
      ltoAccount = this.ltoService.ltoAccountTestnet;
    }

    const chain: EventChain = new EventChain(ltoAccount);
    var buf: Buffer;
    if (pkg.isDynamic) {
      let msg: any;
      if (nftInfo.id != 0) {
        msg = {
          "@context": "instantiate_msg.json",
          ownable_id: chain.id,
          package: pkg.cid,
          network_id: ltoNetworkId,
          keywords: pkg.keywords,
          nft: {
            network: nftInfo.network, id: nftInfo.id.toString(), address: nftInfo.address,
          },
        };
      } else {
        msg = {
          "@context": "instantiate_msg.json",
          ownable_id: chain.id,
          package: pkg.cid,
          network_id: ltoNetworkId,
          keywords: pkg.keywords,
        };
      }

      new Event(msg)
        .addTo(chain)
        .signWith(ltoAccount);

      new Event({ "@context": 'execute_msg.json', transfer: { to: receiver } }).addTo(chain).signWith(ltoAccount);

      // DONE: THIS NEEDS TO BE ENABLED !
      const appendedEvents = chain.startingWith(chain.events[0]);
      const anchorMap1 = appendedEvents.anchorMap;
      try {
        if (ltoNetworkId === 'L') {
          await this.ltoService.ltoMainnet.anchor(ltoAccount, ...anchorMap1);
        } else {
          await this.ltoService.ltoTestnet.anchor(ltoAccount, ...anchorMap1);
        }
      } catch (err) {
        this.loggingService.logError(pkg.cid, `Anchoring Failed: ${err}`);
        throw err;
      }

      chain.validate();
      let genesisSigner: Account;
      if (ltoNetworkId === 'L') {
        genesisSigner = this.ltoService.ltoMainnet.account(chain.events[0].signKey);
      } else {
        genesisSigner = this.ltoService.ltoTestnet.account(chain.events[0].signKey);
      }
      if (!chain.isCreatedBy(genesisSigner)) {
        this.loggingService.logError(pkg.cid, `Event chain hijacking: genesis event not signed by chain creator on lto Network ${ltoNetworkId}`);
        throw new Error(`Event chain hijacking: genesis event not signed by chain creator on lto Network ${ltoNetworkId}`);
      }
      else {
        this.loggingService.log(pkg.cid, `All good! Genesis signer correct after creating the Ownable on lto Network ${ltoNetworkId}`);
      }

      const json1 = `${this.pathToCids}/${pkg.cid}/${pkg.cid}.json`
      try {
        writeFileSync(json1, JSON.stringify(chain));
      } catch (err) {
        this.loggingService.logError(pkg.cid, `Writing ${json1} failed`);
        throw err;
      }

      let file: any;
      try {
        file = readFileSync(json1, { encoding: 'utf8' });
      } catch (err) {
        this.loggingService.logError(pkg.cid, `Reading ${json1} failed`);
        throw err;
      }
      buf = Buffer.from(file, 'utf8');

      // Checking the import of the EvenChain json if this still works (e.g. for ownables-sdk)
      const data: IEventChainJSON = JSON.parse(JSON.stringify(chain));
      const chain1 = EventChain.from(data);
      chain1.validate();
      if (!chain1.isCreatedBy(genesisSigner)) {

        this.loggingService.logError(pkg.cid, `Event chain hijacking: genesis event not signed by chain creator on lto Network ${ltoNetworkId}`);
        throw new Error(`Event chain hijacking: genesis event not signed by chain creator on lto Network ${ltoNetworkId}`);
      }
      else {
        this.loggingService.log(pkg.cid, `All good! Genesis signer correct after reading EventChain from disk on lto Network ${ltoNetworkId}`);
      }
    }

    return buf;
  }


  public getServerLtoWalletAddresses(): [string, string] {
    return [this.getLTOAccountAddress('L'), this.getLTOAccountAddress('T')];
  }
  public getServerEVMwalletAddresses(): [string, string] {
    return this.nft.getEvmWalletAddresses();
  }
  public templateCost(templateId: number) {
    //console.log("templateId", templateId, "chain", chain, " cost: ", this.packageInfo.templateCost[chain][templateId]);
    // if (this.packageInfo.templateCost[chain.toString()][templateId] === undefined) {
    //   throw (`Undefined Template cost for template number ${templateId} and chain: ${chain}`);
    // }
    if (templateId != 1) {
      throw (`Currently only Template ID 1 is support`);
    }
    return {
      'L': {
        'ethereum': this.queueService.getTemplateCosts('L', 'ethereum', '1'),
        'arbitrum': this.queueService.getTemplateCosts('L', 'arbitrum', '1')
      },
      'T': {
        'ethereum': this.queueService.getTemplateCosts('T', 'ethereum', '1'),
        'arbitrum': this.queueService.getTemplateCosts('T', 'arbitrum', '1')
      }
      // 'ethereum': (this.packageInfo.templateCost.ethereum[templateId]).toString(),
      // 'arbitrum': (this.packageInfo.templateCost.arbitrum[templateId]).toString(),
      //'polygon': (this.packageInfo.templateCost.polygon[templateId]).toString()
    }

  }

  private async readOwnableDataFromZip(files: Map<string, Buffer>) {
    try {
      return JSON.parse(files.get('ownableData.json').toString())[0];
    } catch (error) {
      throw (`Failed to read JSON file ownableData.json`);
    }
  }

  // public async createNftS3(pictureBuffer: Buffer): Promise<string> {
  //   try {
  //     const jpegBuffer = await sharp(pictureBuffer)
  //         .jpeg({ quality: 80 }) // Adjust quality (0–100) as needed
  //         .toBuffer();
  //     return jpegBuffer;
  // } catch (error) {
  //     console.error("Error converting buffer to JPEG:", error);
  //     throw error;
  // }
  // }
  public async createPinataPinnedFile(picture: Buffer): Promise<string> {

    let blobPicture: Blob;
    const pinataMetadata = JSON.stringify({
      name: "PictureNFT",
    });
    const pinataOptions = JSON.stringify({
      cidVersion: 1,
    });
    const JWT = this.config.get('pinata.jwt');


    blobPicture = new Blob([picture]);
    const formDataPicture = new FormData();

    if (this.nodeVersion.startsWith('v18.')) {
      formDataPicture.append("file", blobPicture);
    } else if (this.nodeVersion.startsWith('v20.')) {
      const fileBlob = new File([blobPicture], "OwnableNftPicture", { type: 'image/webp' });
      formDataPicture.append("file", fileBlob);
    }

    formDataPicture.append("pinataMetadata", pinataMetadata);
    formDataPicture.append("pinataOptions", pinataOptions);

    let requestPicture: any;
    try {

      requestPicture = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${JWT}`
        },
        body: formDataPicture,
      });
    } catch (err) {
      throw err;
    }
    let responsePicture: any;
    try {
      responsePicture = await requestPicture.json();
    } catch (err) {
      throw err;
    }
    // console.log(response);
    // https://black-rigid-chickadee-743.mypinata.cloud/ipfs/bafkreierxsqjdhgs576mc76idbm2wqhzmjc4uqvalw2fkm43xzjj7247wi

    const pinata_gateway_url = this.config.get('pinata.gateway');
    // console.log("1 pinata_gateway_url", pinata_gateway_url);
    // console.log("1 file", `${pinata_gateway_url}/ipfs/${response.IpfsHash}`);



    let blobJson: Blob;
    const jsonTest = {
      nftImage: `${pinata_gateway_url}/ipfs/${responsePicture.IpfsHash}`
    }

    var buf = Buffer.from(JSON.stringify(jsonTest));

    blobJson = new Blob([buf]);
    const formDataJson = new FormData();

    if (this.nodeVersion.startsWith('v18.')) {
      formDataJson.append("file", blobJson);
    } else if (this.nodeVersion.startsWith('v20.')) {
      const fileBlob = new File([blobJson], "OwnableNftJson", { type: 'application/json' });
      formDataJson.append("file", fileBlob);
    }


    formDataJson.append("pinataMetadata", pinataMetadata);
    formDataJson.append("pinataOptions", pinataOptions);
    let requestJson: any;
    try {
      requestJson = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${JWT}`
        },
        body: formDataJson,
      });
    } catch (err) {
      throw err;
    }
    let responseJson: any;
    try {
      responseJson = await requestJson.json();
      // console.log("response1", responseJson);
    } catch (err) {
      throw err;
    }

    return `${pinata_gateway_url}/ipfs/${responseJson.IpfsHash}`;
  }
  private async mintNewNft(ltoNetworkId: 'L' | 'T', jsonFile: any, requestId: string): Promise<NftInfo> {
    let nftNetwork: string;
    let nftContractAddress: string;
    if (jsonFile.NFT_BLOCKCHAIN === 'ethereum') {
      if (ltoNetworkId === 'L') {
        nftContractAddress = this.config.get('eth.contracts.ethereum.mainnet');
      } else {
        nftContractAddress = this.config.get('eth.contracts.ethereum.testnet');
      }
      nftNetwork = "ethereum";
    } else if (jsonFile.NFT_BLOCKCHAIN === 'arbitrum') {
      if (ltoNetworkId === 'L') {
        nftContractAddress = this.config.get('eth.contracts.arbitrum.mainnet');
      } else {
        nftContractAddress = this.config.get('eth.contracts.arbitrum.testnet');
      }
      nftNetwork = "arbitrum";
    } else {
      this.loggingService.logError(requestId, `Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`);
      throw (`Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`);
    }
    // else if (jsonFile.NFT_BLOCKCHAIN === 'polygon') {
    //   nftContractAddress = this.config.get('eth.contracts.polygon');
    //   nftNetwork = "polygon";
    // } 
    this.loggingService.log(requestId, `minting NFT on ${nftNetwork} via NFT contract at: ${nftContractAddress}`);

    let nftReceiverAddress: string;
    if (ltoNetworkId === 'L') {
      nftReceiverAddress = this.config.get('eth.account.obridge_wallet_address.mainnet');
    } else {
      nftReceiverAddress = this.config.get('eth.account.obridge_wallet_address.testnet');

    }

    // const upload = await this.pinata.upload.json({
    //   id: 2,
    //   name: "Bob Smith",
    //   email: "bob.smith@example.com",
    //   age: 34,
    //   isActive: false,
    //   roles: ["user"]
    // })

    const nftTokenURI = jsonFile.NFT_TOKEN_URI;

    this.loggingService.log(requestId, `nftOwner ${nftReceiverAddress}`);
    this.loggingService.log(requestId, `nftTokenURI ${nftTokenURI}`);
    this.loggingService.log(requestId, `NFT_BLOCKCHAIN ${jsonFile.NFT_BLOCKCHAIN}`);

    const nftInfo: NftInfo = {
      network: nftNetwork,
      address: nftContractAddress,
      id: 0,  // id is not used when minting a new NFT
    };

    let nftcount: number;
    try {
      nftcount = await this.nft.mintNFT(ltoNetworkId, nftReceiverAddress, nftTokenURI, nftInfo);
      // DONE
      // nftcount = 200;
    } catch (err) {
      this.loggingService.logError(requestId, `Minting new NFT failed ${err}`);
      throw err;
    }
    this.loggingService.log(requestId, `nftcount ${nftcount}`);
    nftInfo.id = nftcount;
    return nftInfo;
  }
  private async getSignerOfRequest(req: Request, ltoNetworkId: 'L' | 'T'): Promise<string> {
    // let signerAccountAddress: string;

    console.log("req headers", req.headers);
    console.log("req url", req.url);
    console.log("req method", req.method);
    console.log("req headers origin", req.headers.origin);
    console.log("req headers host", req.headers.host);

    const longUrl = req.headers.origin;
    const httpPartOfUrl = longUrl.split('//');
    const urlWithoutParams = req.url.split('?');
    const signedRequest = {
      headers: {
        'Signature': req.headers.signature,
        'Signature-Input': req.headers['signature-input']
      },
      url: `${httpPartOfUrl[0]}//${req.headers.host}${urlWithoutParams[0]}`,
      method: `${req.method}`
    }
    console.log("signedRequest:", signedRequest);
    let signerAccount: Account = null;
    // First try if request has been signed by mainnet account
    try {
      if (ltoNetworkId === 'L') {
        signerAccount = await verify(signedRequest, this.ltoService.ltoMainnet);
      } else if (ltoNetworkId === 'T') {
        signerAccount = await verify(signedRequest, this.ltoService.ltoTestnet);
      }
    } catch (err) {
      signerAccount = null;
      throw new UserError(
        `Invalid signed request on LTO network ${ltoNetworkId}. Not possible to extract signer. Signed Request: ${JSON.stringify(signedRequest)} Error: ${err}`
      );
    }


    console.log("Extracted signer from LtoRequest:", signerAccount.address);
    return signerAccount.address;

  }
  public async queueRequest(ltoNetworkId: 'L' | 'T', uint8ArrayData: Uint8Array, templateId: number, req: Request): Promise<any> {
    let signerAccountAddress: string;
    // let ltoNetworkId: 'L' | 'T';
    try {
      signerAccountAddress = await this.getSignerOfRequest(req, ltoNetworkId);
      console.log("signerAccountAddress", signerAccountAddress);
      console.log("getNetwork", getNetwork(signerAccountAddress));
      // if (getNetwork(signerAccountAddress) === 'L') {
      //   ltoNetworkId = 'L';
      // } else if (getNetwork(signerAccountAddress) === 'T') {
      //   ltoNetworkId = 'T';

      // } else {
      //   new Error(`Error: Not able to get networkId from ${signerAccountAddress}`);
      // }
    } catch (err) {
      throw err;
    }


    const relayURL = this.getRelayUrl();
    const isUp: boolean = await this.isRelayUp(relayURL);
    if (isUp) {
      console.log(`oRelay Server ${relayURL} is up and running!`);
    }
    else {
      throw new Error(`Error: oRelay Server ${relayURL} is down`);
    }

    if (!this.queueService.isQueueingAllowed(ltoNetworkId)) {
      throw new Error('Queueing of new Requests currently disabled!');
    }

    console.log("unzipping user input file into memory...");
    const requestIdFiles = await this.unzip(uint8ArrayData);

    const timeMillisecondsNow = Date.now().toString();
    requestIdFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

    console.log("requestIdFiles", requestIdFiles);
    console.log("getting request ID of input requestIdFiles...");

    const requestId: string = await this.getUniqueId(requestIdFiles);
    this.loggingService.log(requestId, `New Logging Service added for unique request ID: ${requestId}`);


    if (!requestIdFiles.has('ownableData.json')) {
      this.loggingService.logError(requestId, "Invalid package: 'ownableData.json' is missing");
      throw new Error("Invalid package: 'ownableData.json' is missing");
    }

    this.loggingService.log(requestId, "reading JSON info data from zip for Ownable modification...");
    let jsonFile;
    try {
      jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
    } catch (err) {
      this.loggingService.logError(requestId, `${err}`);
      throw err;
    }

    if (jsonFile.CREATE_NFT === 'true') {
      if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') && !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')) {
        this.loggingService.logError(requestId, `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
        throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
      }
    } else {
      jsonFile.NFT_BLOCKCHAIN = 'noNFT';
    }

    const thisLtoServerAddress = this.getLTOAccountAddress(ltoNetworkId);
    this.loggingService.log(requestId, `LTO ACCOUNT: ${thisLtoServerAddress}`);
    this.loggingService.log(requestId, `Checking LTO transaction ID: ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}`);


    await this.wait(10000);
    let transactionIdData: TransactionIdData;
    try {
      transactionIdData = await this.checkLtoTransactionId(ltoNetworkId, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId, jsonFile.NFT_BLOCKCHAIN, requestId);
      this.loggingService.log(requestId, `transactionIdData:` + JSON.stringify(transactionIdData));
    } catch (err) {
      this.loggingService.logError(requestId, `${err}`);
      throw new Error(err);
    }

    // TODO:
    if (signerAccountAddress !== transactionIdData.sender) {
      throw new UserError(`Error: Signer of Ownable request ${signerAccountAddress} did not sign transactionID ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}. Signer of TXID:${transactionIdData.sender}`);
    }
    let entry: QueueEntry;
    try {
      entry = await this.queueService.enqueue(ltoNetworkId, requestId, uint8ArrayData, transactionIdData.sender, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId);
      this.loggingService.log(requestId, `Added successfully new entry to queue ` + JSON.stringify(entry));
    } catch (err) {
      this.loggingService.logError(requestId, `${err}`);
      throw err;
    }

    return entry;
  }


  private async checkForFailedEntries(ltoNetworkId: 'L' | 'T') {
    const queryProcessingEntry: QueueEntry[] = this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
    if (Array.isArray(queryProcessingEntry) && queryProcessingEntry.length > 0) {
      const firstEntry = queryProcessingEntry[0];
      if (firstEntry.rid && firstEntry.rid !== '') {
        this.loggingService.log(firstEntry.rid, `First Entry: ` + JSON.stringify(firstEntry));
      }

      const timestampNow = Math.floor(Date.now() / 1000);
      if (firstEntry.rid && firstEntry.rid !== '' && this.queueService.isCreatingOwnable() && firstEntry.timestampProcessing > 0 && timestampNow - queryProcessingEntry[0].timestampProcessing >= 300) {
        this.loggingService.log(firstEntry.rid, `Something went wrong with processing Queue Entry. Failed to produce Ownable ` + JSON.stringify(queryProcessingEntry[0]));
        await this.queueService.ownableFailed(ltoNetworkId, queryProcessingEntry[0].rid, "More than 300 seconds inactive in Processing Queue");
      }
    }

  }
  private async checkQueueStatus() {
    this.checkForFailedEntries('L');
    this.checkForFailedEntries('T');

    const isEmpty = this.queueService.isQueueEmpty();
    if (!isEmpty) {
      // console.log("Checking Queue Status: queue not empty...");
      try {
        const relayURL = this.getRelayUrl();
        const isUp: boolean = await this.isRelayUp(relayURL);
        if (isUp) {

          if (!this.queueService.isCreatingOwnable()) {
            // console.log("Waiting 10 seconds for a possible TX ID that needs to be populated into LTO node network...");
            await this.wait(10000);
            let ltoNetworkId, requestId, data, sender;
            try {
              [ltoNetworkId, requestId, data, sender] = await this.queueService.processNextQueueEntry();
            } catch (err) {
              this.loggingService.logError(requestId, `processNextQueueEntry failed on lto network ${ltoNetworkId}: ${err}`);
            }

            if (requestId != null && data != null) {
              try {
                await this.store(ltoNetworkId, requestId, data, 1, sender); // true = verbose
              } catch (err) {
                const queryProcessingEntry1: QueueEntry[] = this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
                this.loggingService.log(queryProcessingEntry1[0].rid, `Ownable creation failed on lto network ${ltoNetworkId}: ${err}`);
                try {
                  await this.queueService.ownableFailed(ltoNetworkId, queryProcessingEntry1[0].rid, `${err}`);
                } catch (e) {
                  this.loggingService.log(queryProcessingEntry1[0].rid, `Setting Ownable Failed failed on lto network ${ltoNetworkId}: ${e}`);
                  throw (e);
                }
                throw err;
              }
            }
          }
        }
        else {
          // this.loggingService.log(Missing RID , `Error: oRelay Server ${relayURL} is down`); 
          throw new Error(`Error: oRelay Server ${relayURL} is down`);
        }
      } catch (err) {
        throw err;
      }
    }

    const queueingAllowed_L = this.config.get('lto.queue.mainnet');
    const queueingAllowed_T = this.config.get('lto.queue.testnet');
    this.queueService.allowQueueing('L', queueingAllowed_L);
    this.queueService.allowQueueing('T', queueingAllowed_T);
  }

  public getInQueueEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.InQueue);
  }
  public getProcessingEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
  }
  public getReadyEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Ready);
  }
  public getSentEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Sent);
  }
  public getQueueEntriesByRequestId(ltoNetworkId: 'L' | 'T', requestId: string): [QueueEntry, number] {
    return this.queueService.getQueueEntryByRequestId(ltoNetworkId, requestId);
  }
  public getQueueEntriesByWallet(wallet: string): QueueEntry[] {
    if (this.isValidLtoAddress(wallet) === "false") {
      return [];
    }
    if (getNetwork(wallet) === 'L') {
      return this.queueService.getQueueEntriesByWallet('L', wallet);
    } else {
      return this.queueService.getQueueEntriesByWallet('T', wallet);

    }
  }
  public getQueueEntriesByStatus(ltoNetworkId: 'L' | 'T', status: OwnableStatus): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(ltoNetworkId, status);
  }

  public queueStatus(): any {
    let isOwnableBeingBuild: string = '';
    let isQueueingAllowed: boolean = true;
    let currentlyProcessedQueueEntry: QueueEntry[] = [];

    const defaultQueueEntry = {
      data: '',
      rid: '',
      ltoWallet: '',
      ltoNetworkId: null,
      hash: '',
      txId: '',
      ownableStatus: OwnableStatus.Unknown,
      templateId: 0,
      timestampInQueue: 0,
      timestampReady: 0,
      timestampProcessing: 0,
      timestampSent: 0,
      timestampFailed: 0,
      failedErrMsg: '',
      cid: '',
      nftInfo: {
        network: '',
        address: '',
        id: 0
      }
    };
    const networkId = this.queueService.isCreatingOwnable();
    if (networkId === 'L' || networkId === 'T') {
      isOwnableBeingBuild = networkId;
      isQueueingAllowed = this.queueService.isQueueingAllowed(networkId);
      currentlyProcessedQueueEntry = this.queueService.getQueueEntriesByStatus(networkId, OwnableStatus.Processing);
    } else {
      currentlyProcessedQueueEntry.push(defaultQueueEntry);
    }
    // const timeElapsed = this.queueBusyTimer * 10; // queueBusytimer is increased each 10 seconds by one

    return {
      creatingOwnable: isOwnableBeingBuild,
      isQueueingAllowed: isQueueingAllowed,
      requestId: currentlyProcessedQueueEntry[0].rid.toString(),
      ltoWallet: currentlyProcessedQueueEntry[0].ltoWallet.toString(),
      hash: currentlyProcessedQueueEntry[0].hash.toString(),
      txId: currentlyProcessedQueueEntry[0].txId.toString(),
      ownableStatus: currentlyProcessedQueueEntry[0].ownableStatus,
      templateId: currentlyProcessedQueueEntry[0].templateId.toString(),
      timestampInQueue: currentlyProcessedQueueEntry[0].timestampInQueue.toString(),
      timestampProcessing: currentlyProcessedQueueEntry[0].timestampProcessing.toString(),
      timestampSent: currentlyProcessedQueueEntry[0].timestampSent.toString(),
      timestampFailed: currentlyProcessedQueueEntry[0].timestampFailed.toString()

    };
  }

  private isValidPackageName(name: string): boolean {
    // Regular expression to match Unicode letters, numbers, underscores, and hyphens
    const xidRegex = /^[a-zA-Z0-9]+(\.webp)?$/g;
    console.log("isValidPackageName", xidRegex.test(name));
    return xidRegex.test(name);
  }
  private sanitizePackageName(name: string, hasdotWebp: boolean): string {
    // Regular expression to match invalid characters
    let baseStr: string = name;
    let extension: string = '';
    if (hasdotWebp && name.endsWith('.webp')) {
      baseStr = name.slice(0, -5); // Remove the .webp part
      extension = '.webp';
    }
    // Replace all non-alphanumeric characters with underscores
    const sanitizedBaseStr = baseStr.replace(/[^a-zA-Z0-9]/g, '');
    return sanitizedBaseStr + extension;
  }
  private wait = (n: number) => new Promise((resolve) => setTimeout(resolve, n));


  public async store(ltoNetworkId: 'L' | 'T', requestId: string, data: Uint8Array, templateId: number, sender: string) {
    try {
      this.loggingService.log(requestId, `Unzipping user input files for Ownable creation into memory`);
      const requestIdFiles = await this.unzip(data);
      this.loggingService.log(requestId, `requestIdFiles: ${requestIdFiles}`);

      if (!requestIdFiles.has('ownableData.json')) {
        this.loggingService.logError(requestId, `Invalid package: 'ownableData.json' is missing in requestId: ${requestId}`);
        throw new Error("Invalid package: 'ownableData.json' is missing");
      }

      const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
      this.loggingService.log(requestId, `jsonFile: ${jsonFile}`);

      if (this.isValidPackageName(jsonFile.PLACEHOLDER1_NAME)) {
        this.loggingService.log(requestId, `Valid package PLACEHOLDER1_NAME. ${jsonFile.PLACEHOLDER1_NAME}`);
      } else {
        this.loggingService.log(requestId, `Sanatizing invalid characters in PLACEHOLDER1_NAME: ${jsonFile.PLACEHOLDER1_NAME}`);
        const sanatized_PLACEHOLDER1_NAME = this.sanitizePackageName(jsonFile.PLACEHOLDER1_NAME, false);
        const sanatized_PLACEHOLDER2_IMG = this.sanitizePackageName(jsonFile.PLACEHOLDER2_IMG, true);
        this.loggingService.log(requestId, `Updating the image file name in the Ownable request from: ${jsonFile.PLACEHOLDER2_IMG} to ${sanatized_PLACEHOLDER2_IMG}`);

        if (requestIdFiles.has(jsonFile.PLACEHOLDER2_IMG)) {
          const bufferValue = requestIdFiles.get(jsonFile.PLACEHOLDER2_IMG);  // Get the Buffer associated with the old key
          if (jsonFile.PLACEHOLDER2_IMG !== sanatized_PLACEHOLDER2_IMG) {      // Check if the old key is different from the new key
            requestIdFiles.set(sanatized_PLACEHOLDER2_IMG, bufferValue);         // Set the Buffer to the new key
            requestIdFiles.delete(jsonFile.PLACEHOLDER2_IMG);                   // Delete the old key
          }
        }
        this.loggingService.log(requestId, `OLD: ${jsonFile.PLACEHOLDER1_NAME}  NEW: ${sanatized_PLACEHOLDER1_NAME}`);
        this.loggingService.log(requestId, `OLD: ${jsonFile.PLACEHOLDER2_IMG}  NEW: ${sanatized_PLACEHOLDER2_IMG}`);
        jsonFile.PLACEHOLDER1_NAME = sanatized_PLACEHOLDER1_NAME;
        jsonFile.PLACEHOLDER2_IMG = sanatized_PLACEHOLDER2_IMG;
      }
      // if (this.isValidPackageName(jsonFile.PLACEHOLDER1_DESCRIPTION)) {
      //   if (verbose) console.log("Valid package PLACEHOLDER1_DESCRIPTION.");
      // } else {
      //   if (verbose) console.log(`Sanatizing invalid characters in PLACEHOLDER1_DESCRIPTION: ${jsonFile.PLACEHOLDER1_DESCRIPTION}`);
      //   jsonFile.PLACEHOLDER1_DESCRIPTION = this.sanitizePackageName(jsonFile.PLACEHOLDER1_DESCRIPTION);

      // }
      // if (this.isValidPackageName(jsonFile.PLACEHOLDER2_TITLE)) {
      //   if (verbose) console.log("Valid package PLACEHOLDER2_TITLE.");
      // } else {
      //   if (verbose) console.log(`Sanatizing invalid characters in PLACEHOLDER2_TITLE: ${jsonFile.PLACEHOLDER2_TITLE}`);
      //   jsonFile.PLACEHOLDER2_TITLE = this.sanitizePackageName(jsonFile.PLACEHOLDER2_TITLE);
      // }
      this.loggingService.log(requestId, `ownableData.json:` + JSON.stringify(jsonFile));

      if (jsonFile.CREATE_NFT === 'true') {
        if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') && !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')) {
          this.loggingService.logError(requestId, `Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
          throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
        }
      } else {
        jsonFile.NFT_BLOCKCHAIN = 'noNFT';
      }
      this.loggingService.log(requestId, `checking LTO transaction ID: ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}`);

      const transactionIdData: TransactionIdData = await this.checkLtoTransactionId(ltoNetworkId, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId, jsonFile.NFT_BLOCKCHAIN, requestId);
      this.loggingService.log(requestId, `transactionIdData: ` + JSON.stringify(transactionIdData));

      // await this.storeFiles(`${this.pathToRids}/${requestId}`, requestId, requestIdFiles);

      // Before creating the Ownable a new NFT is minted with NFT id and the user NFT input data is checked


      let nftInfo: NftInfo;

      if (jsonFile.CREATE_NFT === 'true') {
        // const picture: Buffer = readFileSync(`${this.pathToRids}/${requestId}/${requestId}/${jsonFile.PLACEHOLDER2_IMG}`);
        const picture: Buffer = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
        this.loggingService.log(requestId, `Creating Pinata Pinned File for NFT Token URI using the following picture`);
        try {
          jsonFile.NFT_TOKEN_URI = await this.createPinataPinnedFile(picture);
        } catch (err) {
          this.loggingService.logError(requestId, `Creating pinned Pinata File failed: ${err}`);
          throw (err);
        }
        this.loggingService.log(requestId, `NFT Token URI: ${jsonFile.NFT_TOKEN_URI}`);
        try {
          nftInfo = await this.mintNewNft(ltoNetworkId, jsonFile, requestId);
        } catch (err) {
          this.loggingService.logError(requestId, `Minting NFT failed: ${err}`);
          throw (err);
        }

        jsonFile.PLACEHOLDER1_KEYWORDS.push("hasNFT");
      } else {
        nftInfo = {
          network: "",
          address: "",
          id: 0, // 1, 2, 3      
        }
        jsonFile.PLACEHOLDER1_KEYWORDS.push("noNFT");
      }

      try {
        this.loggingService.log(requestId, `creating template with request ID ${requestId} and modifying requestIdFiles...`);
        await this.startOwnableCreation(ltoNetworkId, requestId, jsonFile, nftInfo, sender, requestIdFiles);
      } catch (err) {
        this.loggingService.logError(requestId, `start Ownable Creation failed ${err}`);
        throw err;
      }
    } catch (err) {
      throw (err);
    }
  }
  private async executeCommand(command: string, requestId: string) {
    return new Promise((resolve, reject) => {
      const child = exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
        if (error) {
          this.loggingService.logError(requestId, `Error executing command: ${stderr}`);
          return reject(error);
        }
        // console.log(stdout);
        resolve(stdout ? stdout : stderr);
      });

      // Listen for process exit
      child.on('exit', (code) => {
        this.loggingService.log(requestId, `Child process exited with code ${code}`);
      });

      // Optional: listen for any uncaught exceptions
      child.on('error', (err) => {
        this.loggingService.logError(requestId, `Failed to start subprocess: ${err}`);
        reject(err);
      });
    });
  }
  private async executeCommand1(ltoNetworkId: 'L' | 'T', command: string, requestId: string) {
    return new Promise((resolve, reject) => {
      const child = exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
        if (error) {
          this.loggingService.logError(requestId, `Error executing command on LTO network ${ltoNetworkId}: ${stderr}`);
          this.queueService.ownableFailed(ltoNetworkId, requestId, `Error executing command ${stderr} with error: ${error}`);
          return reject(error);
        }
        // console.log(stdout);
        resolve(stdout ? stdout : stderr);
      });

      // Listen for process exit
      child.on('exit', (code) => {
        this.loggingService.log(requestId, `Child process exited with code ${code} on LTO network ${ltoNetworkId}`);
      });

      // Optional: listen for any uncaught exceptions
      child.on('error', (err) => {
        this.loggingService.logError(requestId, `Failed to start subprocess on LTO network ${ltoNetworkId}: ${err}`);
        reject(err);
      });
    });
  }


  private async replaceLineInFile(file: string, key: string, value: string) {
    let data: any;
    try {
      data = readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`Read File Sync failed for file ${file}. Error: ${err}`);
    }

    var formatted = data.replace(key, value);
    try {
      writeFileSync(file, formatted, 'utf8');
    } catch (err) {
      throw new Error(`Write File Sync failed for file ${file}. Error: ${err}`);
    }
  }

  private async watchFileCreation(ltoNetworkId: 'L' | 'T', fileName: string, jsonFile: any, nftInfo: NftInfo, sender: string, rid: string) {
    this.loggingService.log(rid, `Ownable creation startet. Waiting for Zip File ${fileName} to be created...`);

    let timeout = 0;
    while (!fileExists(fileName)) {
      this.wait(1000);
      timeout += 1;
      if (timeout >= 300) {
        break;
      }
    }
    this.loggingService.log(rid, `Zip File ${fileName} Created successfully.`);
    this.loggingService.log(rid, `Unzipping to produce unique cid...`);
    let cidFiles: any;
    try {
      cidFiles = await this.unzip(fileName);
    } catch (err) {
      this.loggingService.logError(rid, `Unzipping ${fileName} failed`);
      throw err;
    }

    // adding a timestamp file to the Ownable to guarantee uniqueness for the CID
    const timeMillisecondsNow = Date.now().toString();
    cidFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

    this.loggingService.log(rid, `getting unique chain ID from created ownable zip files ...`);
    let cid: any;
    try {
      cid = await this.getUniqueId(cidFiles);
    } catch (err) {
      this.loggingService.logError(rid, `getting unique CID failed`);
      throw err;
    }
    this.loggingService.log(rid, `setCidNftInfo rid ${rid}`);
    this.loggingService.log(rid, `setCidNftInfo cid ${cid}`);
    this.loggingService.log(rid, `setCidNftInfo nftInfo` + JSON.stringify(nftInfo));
    try {
      await this.queueService.setCidNftInfo(ltoNetworkId, rid, cid, nftInfo);
    } catch (err) {
      this.loggingService.logError(rid, `setting Cid Nft Info failed`);
      throw err;
    }

    const ownableZip = `${this.pathToCids}/${cid}/${cid}.zip`;
    this.loggingService.log(rid, `Storing new Ownable zip file and deleting the source Ownable zip ...`);
    try {
      cpSync(fileName, ownableZip);
    } catch (err) {
      this.loggingService.logError(rid, `Error cpSync ${fileName}. Error: ${err}`);
      throw err;
    }

    try {
      rmSync(fileName);
    } catch (err) {
      this.loggingService.logError(rid, `Error rmSync ${fileName}. Error: ${err}`);
      throw err;
    }
    try {
      rmSync(`ownables/${jsonFile.PLACEHOLDER1_NAME}`, { recursive: true });
    } catch (err) {
      this.loggingService.logError(rid, `Error rmSync ownables/${jsonFile.PLACEHOLDER1_NAME}. Error: ${err}`);
      throw err;
    }

    const pkgOwnable: TypedPackage = {
      isDynamic: true,
      hasMetadata: false,
      hasWidgetState: false,
      isConsumable: false,
      isConsumer: false,
      isTransferable: true,
      title: jsonFile.PLACEHOLDER2_TITLE.toString(),
      name: jsonFile.PLACEHOLDER1_NAME.toString(),
      description: jsonFile.PLACEHOLDER1_DESCRIPTION.toString(),
      cid: `${cid}`,
      versions: [jsonFile.PLACEHOLDER1_VERSION.toString()],
      keywords: jsonFile.PLACEHOLDER1_KEYWORDS
    };
    this.loggingService.log(rid, `Creating the EventChain for the new Ownable. Pkg:` + JSON.stringify(pkgOwnable));


    let chainBuffer: Buffer;
    try {
      chainBuffer = await this.createEventChain(pkgOwnable, nftInfo, sender); // sender from TX ID is new ownable owner
    } catch (err) {
      this.loggingService.logError(rid, `Create Event Chain failed ${nftInfo} ${sender} Error: ${err}`);
      throw err;
    }

    cidFiles.set('chain.json', chainBuffer);

    try {
      await this.storeFiles(`${this.pathToCids}/${cid}`, cid, cidFiles);
    } catch (err) {
      this.loggingService.logError(rid, `Storing files failed ${this.pathToCids}/${cid} Error: ${err}`);
      throw err;
    }

    var new_zip = new JSZip();

    let zipFile: Buffer;
    try {
      zipFile = readFileSync(`${this.pathToCids}/${cid}/${cid}.zip`);
    } catch (err) {
      this.loggingService.logError(rid, `Reading File failed ${this.pathToCids}/${cid}/${cid}.zip Error: ${err}`);
      throw err;
    }
    try {
      await new_zip.loadAsync(zipFile);
    } catch (err) {
      this.loggingService.logError(rid, `Loading async File failed. Error: ${err}`);
      throw err;
    }
    let eventChainJsonFile: Buffer;
    try {
      eventChainJsonFile = readFileSync(`${this.pathToCids}/${cid}/${cid}.json`);
    } catch (err) {
      this.loggingService.logError(rid, `Reading File failed ${this.pathToCids}/${cid}/${cid}.json Error: ${err}`);
      throw err;
    }
    this.loggingService.log(rid, `Adding chain.json to new zip`);
    new_zip.file('chain.json', eventChainJsonFile);
    this.loggingService.log(rid, `Unique timestamp file to new zip`);
    new_zip.file('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

    let zipContent: any;
    try {
      zipContent = await new_zip.generateAsync({ type: "uint8array" });
    } catch (err) {
      this.loggingService.logError(rid, `Failed to generate Async new zip Content: ${err}`);
      throw err;
    }
    try {
      await this.queueService.setQueueEntryStatus(ltoNetworkId, rid, OwnableStatus.Ready);
    } catch (err) {
      this.loggingService.logError(rid, `Failed to set Queue Entry status to Ready: ${err}`);
      throw err;
    }
    // await this.wait(20000); // TODO
    try {
      await this.storeZip(`${this.pathToCids}/${cid}`, cid, zipContent);
    } catch (err) {
      this.loggingService.logError(rid, `Failed to store Zip Content to file ${this.pathToCids}/${cid}/${cid}.zip: ${err}`);
      throw err;
    }
    try {
      await this.sendOwnable(ltoNetworkId, rid, sender, zipContent);
    } catch (err) {
      this.loggingService.logError(rid, `Failed to send Ownable RID:${rid} SENDER:${sender}: ${err}`);
      throw err;
    }
  }


  private async startOwnableCreation(ltoNetworkId: 'L' | 'T', rid: string, jsonFile: any, nftInfo: NftInfo, sender: string, requestIdFiles: Map<string, Buffer>) {
    this.loggingService.log(rid, `Starting Ownable creation...`);
    this.loggingService.log(rid, `Copying template 1 to template directory for modification`);
    let cpCmdFrom = `${this.pathToTemplates}/template1`
    let cpCmdTo = `ownables/${jsonFile.PLACEHOLDER1_NAME}`;
    try {
      cpSync(cpCmdFrom, cpCmdTo, { "recursive": true });
      this.loggingService.log(rid, `Success: copy template from ${cpCmdFrom} to ${cpCmdTo}`);
    } catch (err) {
      this.loggingService.logError(rid, `Failed to copy template from ${cpCmdFrom} to ${cpCmdTo}`);
      throw (err);
    }
    this.loggingService.log(rid, `Request ID: ${rid}`);
    this.loggingService.log(rid, `PLACEHOLDER2_IMG: ${jsonFile.PLACEHOLDER2_IMG}`);
    this.loggingService.log(rid, `OWNABLE_THUMBNAIL: ${jsonFile.OWNABLE_THUMBNAIL}`);

    this.loggingService.log(rid, `copying image file into template`);
    const image = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
    let writeCommand = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`;
    try {
      writeFileSync(writeCommand, image);
    }
    catch (err) {
      this.loggingService.logError(rid, `Write command failed ${writeCommand} for image ${image}`);
      throw (err);
    }

    this.loggingService.log(rid, `copying thumbnail image file into template`);

    const thumbnail = requestIdFiles.get(`${jsonFile.OWNABLE_THUMBNAIL}`);
    writeCommand = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`;
    try {
      writeFileSync(writeCommand, thumbnail);
    }
    catch (err) {
      this.loggingService.logError(rid, `Write command failed ${writeCommand} for thumbnail ${thumbnail}`);
      throw (err);
    }

    this.loggingService.log(rid, `Replacing Placeholder texts of template with user input data`);
    try {
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_NAME".toString(), `"${jsonFile.PLACEHOLDER1_NAME}"`.toString());
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_DESCRIPTION".toString(), `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`.toString());
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_VERSION".toString(), `"${jsonFile.PLACEHOLDER1_VERSION}"`.toString());
      if (typeof jsonFile.PLACEHOLDER1_AUTHORS === 'undefined')
        jsonFile.PLACEHOLDER1_AUTHORS = '';
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_AUTHORS".toString(), `"${jsonFile.PLACEHOLDER1_AUTHORS}"`.toString());

      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_KEYWORDS".toString(), arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS));

      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(), "PLACEHOLDER2_TITLE".toString(), `${jsonFile.PLACEHOLDER2_TITLE}`);
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(), "PLACEHOLDER2_IMG".toString(), `"${jsonFile.PLACEHOLDER2_IMG}"`.toString());

      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(), "PLACEHOLDER3_MSG".toString(), `${jsonFile.PLACEHOLDER1_NAME}`);
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(), "PLACEHOLDER3_STATE".toString(), `${jsonFile.PLACEHOLDER1_NAME}`);

      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_CONTRACT_NAME".toString(), `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`.toString());
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_TYPE".toString(), `"${jsonFile.PLACEHOLDER4_TYPE}"`.toString());
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_DESCRIPTION".toString(), `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`.toString());
      await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_NAME".toString(), `"${jsonFile.PLACEHOLDER4_NAME}"`.toString());
    } catch (err) {
      this.loggingService.logError(rid, `Replacing Placeholder texts failed ${err}`);
      throw (err);
    }

    this.loggingService.log(rid, `Checking Cargo, Wasm-Pack and Rustup existance...`);
    try {
      const output = await this.executeCommand('cargo --version', rid);
      this.loggingService.log(rid, `${output}`);
    } catch (err) {
      this.loggingService.logError(rid, `Cargo command failed, but essential for Ownable creation: ${err}`);
      throw err;
    }
    try {
      const output = await this.executeCommand('rustup --version', rid);
      this.loggingService.log(rid, `${output}`);
    } catch (err) {
      this.loggingService.logError(rid, `Rustup command failed, but essential for Ownable creation: ${err}`);
      throw err;
    }
    try {
      const output = await this.executeCommand('wasm-pack --version', rid);
      this.loggingService.log(rid, `${output}`);
    } catch (err) {
      this.loggingService.logError(rid, `Wasm-Pack command failed, but essential for Ownable creation: ${err}`);
      throw err;
    }

    try {
      this.loggingService.log(rid, `Building Ownable...`);
      const output = await this.executeCommand1(ltoNetworkId, `npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`, rid);
      this.loggingService.log(rid, `${output}`);
    } catch (err) {
      this.loggingService.logError(rid, `Command: npm run ownables command failed: ${err}`);
      try {
        const output = await this.executeCommand(`rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME}`, rid);
        this.loggingService.log(rid, `${output}`);
      } catch (error) {
        this.loggingService.logError(rid, `Command: rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME} failed: ${error}`);
        throw error;
      }
    }

    const zipFileToWatch = `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`;
    try {
      this.loggingService.log(rid, `Starting file watcher for zip file: ${zipFileToWatch}`);
      await this.watchFileCreation(ltoNetworkId, `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`, jsonFile, nftInfo, sender, rid);
    } catch (err) {
      this.loggingService.logError(rid, `Failed to watch File creation for ${zipFileToWatch}. ${err}`);
      throw err;
    }
  }

  private async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
    let archive: JSZip;
    var zip = new JSZip();
    if (typeof data === "string") {
      archive = await zip.loadAsync(readFileSync(data), { createFolders: true });
    } else {
      archive = await zip.loadAsync(data, { createFolders: true });
    }

    const entries: Array<[string, Buffer]> = await Promise.all(
      Object.entries(archive.files)
        // .filter(([filename]) => filename !== 'chain.json')
        .map(async ([filename, file]) => [filename, await file.async('nodebuffer')]),
    );

    return new Map(entries);
  }

  private async getUniqueId(files: Map<string, Buffer>): Promise<string> {
    const source = Array.from(files.entries()).map(([filename, content]) => ({
      path: `./${filename}`,
      content,
    }));

    for await (const entry of this.ipfs.addAll(source, { onlyHash: true, cidVersion: 1 })) {
      //if (entry.path === entry.cid.toString() && !!entry.mode) return entry.cid.toString();
      if (entry.path === entry.cid.toString()) {
        return entry.cid.toString();
      }
    }
    throw new Error('Failed to calculate directory CID: importer did not find a directory entry in the input files');
  }

  private async storeZip(destPath: string, uniqueId: string, data: Uint8Array): Promise<void> {
    const file = path.join(destPath, `${uniqueId}.zip`);
    writeFileSync(file, data);
  }


  private async storeFiles(destPath: string, cid: string, files: Map<string, Buffer>): Promise<void> {
    const packageDir = path.join(destPath, cid);
    mkdirSync(packageDir, { recursive: true });

    await Promise.all(
      Array.from(files.entries()).map(([filename, content]) => writeFileSync(path.join(packageDir, filename), content)),
    );
  }

}
