import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, createWriteStream, createReadStream } from 'fs';
import { ConfigService } from '../common/config/config.service';
import arrayToString from '../utils/arrayToString';
import JSZip from 'jszip';
import fileExists from '../utils/fileExists';
import path from 'path';
import { HttpService } from '@nestjs/axios';
// import { catchError, firstValueFrom } from 'rxjs';
// import { AxiosError } from 'axios';
import { Account, Binary, LTO, Event, EventChain, Message, Relay } from "@ltonetwork/lto";
import { exec } from 'child_process';
// import chokidar from 'chokidar';
import { NftInfo, OwnableInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { TypedPackage } from "../interfaces/TypedPackage";
import { NFTService } from '../nft/nft.service';
import { IEventChainJSON } from '@ltonetwork/lto/interfaces';
import { Blob } from 'buffer';
// import { json } from 'node:stream/consumers';
// import { stringify } from 'querystring';
// import sendFile from '../services/relayhelper.service';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { PinataSDK } from "pinata";
import { QueueService } from '../services/Queue.service';
import { TelegramService } from '../services/TelegramBot.service';
import { UserError } from 'src/interfaces/error';
import { Request, Response } from 'express';
import { sign, verify } from '@ltonetwork/http-message-signatures';


@Injectable()
export class UploadZipService implements OnModuleInit, OnModuleDestroy {
  private pathToRids: string;
  private pathToCids: string;
  private pathToTemplates: string;
  private packageInfo: any;
  private intervalId: NodeJS.Timeout;
  private lto = new LTO(this.config.get('lto.networkId'));
  private readonly _ltoAccount?: Account = this.lto.account({ seed: this.config.get('lto.account.seed') });
  public readonly networkId = this.lto.networkId;
  private nodeVersion = process.version;
  private pinata = new PinataSDK({
    pinataJwt: this.config.get('pinata.jwt'), // process.env.PINATA_JWT!,
    pinataGateway: this.config.get('pinata.gateway') // "example-gateway.mypinata.cloud",
  });
  private telegramBotToken = this.config.get('telegramBot.token');
  private telegramBotChannelId = this.config.get('telegramBot.channelId');



  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    // private readonly zip: JSZip,
    private nft: NFTService,
    private readonly queueService: QueueService,
    private readonly telegramService: TelegramService,
    @Inject('IPFS') private readonly ipfs: IPFS,
  ) { }

  async onModuleInit() {
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


  public async GetServerETHBalance(): Promise<[string, string]> {
    const retValues = await this.nft.getServerETHBalance();
    await this.telegramService.sendMessageToTelegramBot(`\nethereum: ${retValues[0]}\narbitrum: ${retValues[1]}`);

    return await this.nft.getServerETHBalance();
  }
  public getLTOAccountAddress(): string {
    if (!!this._ltoAccount) return this._ltoAccount!.address;
    return '';
  }
  public isEVMAddress(address: string): boolean {
    return this.nft.isEVMAddress(address);
  }
  public isValidLtoAddress(address: string): boolean {
    return this.lto.isValidAddress(address);
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
        await this.queueService.setQueueEntryStatus(rid, OwnableStatus.Sent, message.hash.base58);
      } else {
        console.log("provide the signer and recipient");
        return;
      }


    } catch {
      return true;
    }
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
  public async sendOwnable(rid: string, recipient: string, content?: Uint8Array) {
    const relayURL = this.getRelayUrl();

    // console.log("relayURL:", `${relayURL}`);
    this.lto.relay = new Relay(`${relayURL}`);
    // const relay = new Relay('http://relay-dev.eba-zrdkspxn.eu-west-1.elasticbeanstalk.com');

    const relay = this.lto.relay;
    const sender: Account = this._ltoAccount;
    try {
      if (recipient) {
        await this.sendFile(relay, content, sender, recipient, rid);
      } else {
        throw new Error("No recipient provided");
      }
    } catch (error) {
      throw new Error(`Error sending message: ${error}`);
    }
  }

  public getLTOAccount(): Account {
    if (!this._ltoAccount) {
      throw new Error("Not logged in");
    }
    return this._ltoAccount;
  }

  private async checkReuseOfTxId(ltoTransactionId: string, requestId: string) {
    console.log(`Checking if TX ID ${ltoTransactionId} has already been used for a previous request`);

    const previousRequestId = this.queueService.getRequestIdByTxId(ltoTransactionId);
    // DONE
    if (previousRequestId != null && previousRequestId !== requestId) {
      throw (`LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId}`);
    }
  }

  private async checkLtoTransactionId(ltoTransactionId: string, templateId: number, chain: string, requestId: string): Promise<TransactionIdData> {
    // FIRST WORKING METHOD
    const url = `${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`;
    console.log("HTTP Request sent to:", url);
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
      console.log("Request Done. Data:", data);
      if (data.status === 'error') {
        throw new Error(data.details);
      }
    } catch (err) {
      throw new Error(err);
    }

    const thisServerAddress = this.getLTOAccountAddress();
    console.log("This ServerAddress:", thisServerAddress);

    // Must be of type "transaction"
    if (data.type != 4) throw new Error('Wrong Transaction type');
    const templateCosts: string = this.queueService.getTemplateCosts(chain.toString(), templateId.toString());

    if (templateCosts === undefined) throw new Error(`Undefined templateCost for chain ${chain}`);
    //check for correct amount and correct recipient (this servers' LTO wallet)
    console.log("data.fee", data.fee.toString())
    console.log("data.amount", data.amount.toString())
    // console.log("Template Cost", this.packageInfo.templateCost[chain.toString()][templateId].toString());
    console.log("Template Cost", templateCosts);

    if (data.amount.toString() !== templateCosts) {
      console.log("templateCost", templateCosts);
      console.log("amount sent", data.amount.toString());
      throw new Error('Wrong LTO amount for Template');
    }
    if (data.recipient != thisServerAddress) {
      console.log("thisServerAddress", thisServerAddress);
      console.log("data.recipient", data.recipient);
      throw new Error('Wrong recipient! Use Server LTO Wallet address');
    }
    try {
      await this.checkReuseOfTxId(ltoTransactionId, requestId);
    } catch (err) {
      throw new Error(`Check reuse of TxID failed ${err}`);
    }

    return {
      type: data.type,
      sender: data.sender,
      recipient: data.recipient,
      amount: data.amount,
    };
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
          1: this.queueService.getTemplateCosts('ethereum', '1')
        }
      },
      arbitrum: {
        name: 'arbitrum',
        logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
        smartContractAddress: this.config.get('eth.contracts.arbitrum'),
        totalAmountNFTs: nftCountARB.toString(),
        templateCost: {
          1: this.queueService.getTemplateCosts('arbitrum', '1')
        }
      }
    };

    return JSON.parse(JSON.stringify(availableChains));
  }


  private async createEventChain(pkg: TypedPackage, nftInfo: NftInfo, sender: string): Promise<Buffer> {
    const chain = new EventChain(this._ltoAccount);
    var buf: Buffer;
    if (pkg.isDynamic) {
      let msg;
      if (nftInfo.id != 0) {
        msg = {
          "@context": "instantiate_msg.json",
          ownable_id: chain.id,
          package: pkg.cid,
          network_id: this.networkId,
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
          network_id: this.networkId,
          keywords: pkg.keywords,
        };
      }

      new Event(msg)
        .addTo(chain)
        .signWith(this._ltoAccount);

      new Event({ "@context": 'execute_msg.json', transfer: { to: sender } }).addTo(chain).signWith(this._ltoAccount);
      // console.log("CHAIN2:", JSON.stringify(chain));
      // console.log("CHAIN3:", chain);

      // DONE: THIS NEEDS TO BE ENABLED !
      const appendedEvents = chain.startingWith(chain.events[0]);
      const anchorMap1 = appendedEvents.anchorMap;
      await this.lto.anchor(this._ltoAccount, ...anchorMap1);

      chain.validate();
      const genesisSigner = this.lto.account(chain.events[0].signKey);
      if (!chain.isCreatedBy(genesisSigner))
        throw new Error('Event chain hijacking: genesis event not signed by chain creator');
      else {
        console.log("All good! Genesis signer correct after creating the Ownable")
      }

      writeFileSync(`${this.pathToCids}/${pkg.cid}/${pkg.cid}.json`, JSON.stringify(chain));

      const file = readFileSync(`${this.pathToCids}/${pkg.cid}/${pkg.cid}.json`, { encoding: 'utf8' });
      buf = Buffer.from(file, 'utf8');

      // Checking the import of the EvenChain json if this still works (e.g. for ownables-sdk)
      const data: IEventChainJSON = JSON.parse(JSON.stringify(chain));
      const chain1 = EventChain.from(data);
      chain1.validate();
      if (!chain1.isCreatedBy(genesisSigner))
        throw new Error('Event chain hijacking: genesis event not signed by chain creator');
      else {
        console.log("All good! Genesis signer correct after reading EventChain from disk")
      }
    }

    return buf;
  }


  public getServerLTOwalletAddress(): string {
    return this.getLTOAccountAddress();
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

      'ethereum': this.queueService.getTemplateCosts('ethereum', '1'),
      'arbitrum': this.queueService.getTemplateCosts('arbitrum', '1'),
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

    const requestPicture = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${JWT}`
      },
      body: formDataPicture,
    });
    const responsePicture = await requestPicture.json();
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

    const requestJson = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${JWT}`
      },
      body: formDataJson,
    });
    const responseJson = await requestJson.json();
    // console.log("response1", responseJson);


    return `${pinata_gateway_url}/ipfs/${responseJson.IpfsHash}`;
  }
  private async mintNewNft(jsonFile: any, verbose: boolean): Promise<NftInfo> {
    let nftNetwork: string;
    let nftContractAddress: string;
    if (jsonFile.NFT_BLOCKCHAIN === 'ethereum') {
      nftContractAddress = this.config.get('eth.contracts.ethereum');
      nftNetwork = "ethereum";
    } else if (jsonFile.NFT_BLOCKCHAIN === 'arbitrum') {
      nftContractAddress = this.config.get('eth.contracts.arbitrum');
      nftNetwork = "arbitrum";
    } else {
      throw (`Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`);
    }
    // else if (jsonFile.NFT_BLOCKCHAIN === 'polygon') {
    //   nftContractAddress = this.config.get('eth.contracts.polygon');
    //   nftNetwork = "polygon";
    // } 
    if (verbose) console.log(`minting NFT on ${nftNetwork} via NFT contract at: ${nftContractAddress} `);

    // const nftOwner = jsonFile.NFT_PUBLIC_USER_WALLET_ADDRESS;
    const nftReceiverAddress = this.config.get('eth.account.obridge_wallet_address');

    // const upload = await this.pinata.upload.json({
    //   id: 2,
    //   name: "Bob Smith",
    //   email: "bob.smith@example.com",
    //   age: 34,
    //   isActive: false,
    //   roles: ["user"]
    // })

    const nftTokenURI = jsonFile.NFT_TOKEN_URI;

    if (verbose) console.log("nftOwner", nftReceiverAddress);
    if (verbose) console.log("nftTokenURI", nftTokenURI);
    if (verbose) console.log("NFT_BLOCKCHAIN", jsonFile.NFT_BLOCKCHAIN);

    const nftInfo: NftInfo = {
      network: nftNetwork,
      address: nftContractAddress,
      id: 0,  // id is not used when minting a new NFT
    };

    //DONE
    const nftcount: number = await this.nft.mintNFT(nftReceiverAddress, nftTokenURI, nftInfo);
    // const nftcount = 200;
    if (verbose) console.log("nftcount", nftcount);
    nftInfo.id = nftcount;
    return nftInfo;

  }
  public async queueRequest(uint8ArrayData: Uint8Array, templateId: number, verbose: boolean, req: Request): Promise<any> {
    // let signerAccountAddress: string;
    // try {      
    //   if(verbose) console.log("req headers",req.headers);
    //   if(verbose) console.log("req url", req.url);
    //   if(verbose) console.log("req method", req.method);
    //   if(verbose) console.log("req headers origin", req.headers.origin);
    //   if(verbose) console.log("req headers host", req.headers.host);

    //   const longUrl = req.headers.origin;
    //   const httpPartOfUrl = longUrl.split('//');
    //   const signedRequest = {
    //     headers: {
    //       'Signature': req.headers.signature,
    //       'Signature-Input': req.headers['signature-input']
    //     },
    //     url: `${httpPartOfUrl}//${req.headers.host}${req.url}`,
    //     method: `${req.method}`
    //   }
    //   if(verbose) console.log("signedRequest:", signedRequest);
    //   const signerAccount: Account = await verify(signedRequest, this.lto);
    //   if(verbose) console.log("Extracted signer from LtoRequest:", signerAccount.address);
    //   signerAccountAddress=signerAccount.address;
    // } catch (err) {

    //   throw new UserError(
    //     `Invalid signed LTO request. Not possible to extract signer. Provided signed LTO request: ${req.headers} and Error: ${err}`
    //   );

    // }



    const relayURL = this.getRelayUrl();
    const isUp: boolean = await this.isRelayUp(relayURL);
    if (isUp) {
      if (verbose) console.log(`oRelay Server ${relayURL} is up and running!`);
    }
    else {
      throw new Error(`Error: oRelay Server ${relayURL} is down`);
    }

    if (!this.queueService.isQueueingAllowed()) {
      throw new Error('Queueing of new Requests currently disabled!');
    }

    if (verbose) console.log("unzipping user input file into memory...");
    const requestIdFiles = await this.unzip(uint8ArrayData);
    console.log("requestIdFiles", requestIdFiles);

    if (verbose) console.log("getting request ID of input requestIdFiles...");
    const requestId: string = await this.getUniqueId(requestIdFiles);
    if (verbose) console.log("Unique request ID:", requestId);

    const [entry1, index] = this.queueService.getQueueEntryByRequestId(requestId);
    if (entry1.ownableStatus != OwnableStatus.Unknown) {
      throw new Error(`RequestId ${requestId} has been received already`);
    }

    if (verbose) console.log("checking for userOwnable.json existance...");
    if (!requestIdFiles.has('ownableData.json')) throw new Error("Invalid package: 'ownableData.json' is missing");

    if (verbose) console.log("reading JSON info data from zip for Ownable modification...");
    const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);

    if (jsonFile.CREATE_NFT === 'true') {
      if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') && !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')) {
        throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
      }
    } else {
      jsonFile.NFT_BLOCKCHAIN = 'noNFT';
    }
    if (verbose) console.log("LTO ACCOUNT:", this.getLTOAccountAddress());
    if (verbose) console.log("checking LTO transaction ID...", jsonFile.OWNABLE_LTO_TRANSACTION_ID);

    await this.wait(10000);
    let transactionIdData: TransactionIdData;
    try {
      transactionIdData = await this.checkLtoTransactionId(jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId, jsonFile.NFT_BLOCKCHAIN, requestId);
      if (verbose) console.log("transactionIdData:", transactionIdData);

    } catch (err) {
      throw new Error(err);
    }

    // TODO:
    // if (signerAccountAddress !== transactionIdData.sender) {
    //   throw new UserError(`Error: Signer of Ownable request ${signerAccountAddress} did not sign transactionID ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}. Signer of TXID:${transactionIdData.sender}`);
    // }
    let entry: QueueEntry;
    try {
      entry = await this.queueService.enqueue(requestId, uint8ArrayData, transactionIdData.sender, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId);

    } catch (err) {
      throw err;
    }

    return entry;


  }



  private async checkQueueStatus() {

    const queryProcessingEntry: QueueEntry[] = this.queueService.getQueueEntriesByStatus(OwnableStatus.Processing);
    const timestampNow = Math.floor(Date.now() / 1000);
    if (typeof queryProcessingEntry !== 'undefined' &&  queryProcessingEntry.length > 0) {
      console.log("queryProcessingEntry[0]",queryProcessingEntry[0]);
      if (queryProcessingEntry[0].rid !== '' && this.queueService.isCreatingOwnable() && queryProcessingEntry[0].timestampProcessing > 0 && timestampNow - queryProcessingEntry[0].timestampProcessing >= 300) {
        console.log(`Something went wrong with processing Queue Entry. Failed to produce Ownable ${queryProcessingEntry[0]}`);

        // await this.queueService.deleteOwnableData(queryProcessingEntry[0].rid);
        await this.queueService.ownableFailed(queryProcessingEntry[0].rid, "More than 300 seconds inactive in Processing Queue");
      }
    }
    const isEmpty = this.queueService.isQueueEmpty();
    if (!isEmpty) {
      console.log("Checking Queue Status: queue not empty...");
      try {
        const relayURL = this.getRelayUrl();
        const isUp: boolean = await this.isRelayUp(relayURL);
        if (isUp) {

          if (!this.queueService.isCreatingOwnable()) {
            // console.log("Waiting 10 seconds for a possible TX ID that needs to be populated into LTO node network...");
            await this.wait(10000);
            const [requestId, data, sender] = await this.queueService.processNextQueueEntry();
            if (requestId != null && data != null) {
              try {
                await this.store(data, 1, sender, true); // true = verbose
              } catch (err) {
                await this.queueService.ownableFailed(queryProcessingEntry[0].rid, `${err}`);
                throw err;
              }
            }
          }
        }
        else {
          throw new Error(`Error: oRelay Server ${relayURL} is down`);
        }
      } catch (err) {
        throw err;
      }
    }



    const queueingAllowed = this.config.get('lto.queue');
    this.queueService.allowQueueing(queueingAllowed);
  }

  public getInQueueEntries(): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(OwnableStatus.InQueue);
  }
  public getProcessingEntries(): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(OwnableStatus.Processing);
  }
  public getReadyEntries(): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(OwnableStatus.Ready);
  }
  public getSentEntries(): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(OwnableStatus.Sent);
  }
  public getQueueEntriesByRequestId(requestId: string): [QueueEntry, number] {
    return this.queueService.getQueueEntryByRequestId(requestId);
  }
  public getQueueEntriesByWallet(wallet: string): QueueEntry[] {
    return this.queueService.getQueueEntriesByWallet(wallet);
  }
  public getQueueEntriesByStatus(status: OwnableStatus): QueueEntry[] {
    return this.queueService.getQueueEntriesByStatus(status);
  }

  public queueStatus(): any {
    let isOwnableBeingBuild: boolean = false;
    let isQueueingAllowed: boolean;
    let currentlyProcessedQueueEntry: QueueEntry[] = [];

    const defaultQueueEntry = {
      data: '',
      rid: '',
      ltoWallet: '',
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

    if (this.queueService.isCreatingOwnable()) {
      isOwnableBeingBuild = true;
      currentlyProcessedQueueEntry = this.queueService.getQueueEntriesByStatus(OwnableStatus.Processing);
    } else {
      currentlyProcessedQueueEntry.push(defaultQueueEntry);
    }
    isQueueingAllowed = this.queueService.isQueueingAllowed();
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


  public async store(data: Uint8Array, templateId: number, sender: string, verbose?: boolean) {
    try {
      // console.log("data", data);
      if (verbose) console.log("unzipping user input file into memory...");
      const requestIdFiles = await this.unzip(data);
      console.log("requestIdFiles", requestIdFiles);

      if (verbose) console.log("getting request ID of input requestIdFiles...");
      const requestId: string = await this.getUniqueId(requestIdFiles);
      if (verbose) console.log("Unique request ID:", requestId);


      //await this.wait(20000); // TODO
      if (verbose) console.log("checking for userOwnable.json existance...");
      if (!requestIdFiles.has('ownableData.json')) throw new Error("Invalid package: 'ownableData.json' is missing");
      // if (!requestIdFiles.has('ownableData.json')) throw new Error("Invalid package: 'ownableData.json' is missing");

      if (verbose) console.log("reading JSON info data from zip for Ownable modification...");
      const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);

      if (this.isValidPackageName(jsonFile.PLACEHOLDER1_NAME)) {
        if (verbose) console.log("Valid package PLACEHOLDER1_NAME.");
      } else {
        if (verbose) console.log(`Sanatizing invalid characters in PLACEHOLDER1_NAME: ${jsonFile.PLACEHOLDER1_NAME}`);

        const sanatized_PLACEHOLDER1_NAME = this.sanitizePackageName(jsonFile.PLACEHOLDER1_NAME,false);
        const sanatized_PLACEHOLDER2_IMG = this.sanitizePackageName(jsonFile.PLACEHOLDER2_IMG,true);
        
        if (verbose) console.log(`Updating the image file name in the Ownable request from: ${jsonFile.PLACEHOLDER2_IMG} to ${sanatized_PLACEHOLDER2_IMG}`);
        if (requestIdFiles.has(jsonFile.PLACEHOLDER2_IMG)) {
          const bufferValue = requestIdFiles.get(jsonFile.PLACEHOLDER2_IMG);  // Get the Buffer associated with the old key
          requestIdFiles.set(sanatized_PLACEHOLDER2_IMG, bufferValue);         // Set the Buffer to the new key
          requestIdFiles.delete(jsonFile.PLACEHOLDER2_IMG);                   // Delete the old key
        }
        if (verbose) console.log(`OLD: ${jsonFile.PLACEHOLDER1_NAME}  NEW: ${sanatized_PLACEHOLDER1_NAME}`);
        if (verbose) console.log(`OLD: ${jsonFile.PLACEHOLDER2_IMG}  NEW: ${sanatized_PLACEHOLDER2_IMG}`);
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
      if (verbose) console.log("ownableData.json", jsonFile);
      if (jsonFile.CREATE_NFT === 'true') {
        if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') && !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')) {
          throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
        }
      } else {
        jsonFile.NFT_BLOCKCHAIN = 'noNFT';
      }
      if (verbose) console.log("LTO ACCOUNT:", this.getLTOAccountAddress());
      if (verbose) console.log("checking LTO transaction ID...", jsonFile.OWNABLE_LTO_TRANSACTION_ID);


      const transactionIdData: TransactionIdData = await this.checkLtoTransactionId(jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId, jsonFile.NFT_BLOCKCHAIN, requestId);
      if (verbose) console.log("transactionIdData:", transactionIdData);


      // await this.storeFiles(`${this.pathToRids}/${requestId}`, requestId, requestIdFiles);

      // Before creating the Ownable a new NFT is minted with NFT id and the user NFT input data is checked


      let nftInfo: NftInfo;

      if (jsonFile.CREATE_NFT === 'true') {
        // const picture: Buffer = readFileSync(`${this.pathToRids}/${requestId}/${requestId}/${jsonFile.PLACEHOLDER2_IMG}`);
        const picture: Buffer = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
        if (verbose) console.log("Creating Pinata Pinned File for NFT Token URI using the following picture:", picture);
        jsonFile.NFT_TOKEN_URI = await this.createPinataPinnedFile(picture);
        if (verbose) console.log("NFT Token URI:", jsonFile.NFT_TOKEN_URI);

        nftInfo = await this.mintNewNft(jsonFile, verbose);

        jsonFile.PLACEHOLDER1_KEYWORDS.push("hasNFT");
      } else {
        nftInfo = {
          network: "",
          address: "",
          id: 0, // 1, 2, 3      
        }
        jsonFile.PLACEHOLDER1_KEYWORDS.push("noNFT");
      }
      if (verbose) console.log(`creating template with request ID ${requestId} and modifying requestIdFiles...`);
      try {
        await this.startOwnableCreation(requestId, jsonFile, nftInfo, sender, requestIdFiles, verbose);
      } catch (err) {
        throw err;
      }
    } catch (err) {
      throw (err);
    }
  }
  private async executeCommand(command: string) {
    return new Promise((resolve, reject) => {
      const child = exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${stderr}`);
          return reject(error);
        }
        // console.log(stdout);
        resolve(stdout ? stdout : stderr);
      });

      // Listen for process exit
      child.on('exit', (code) => {
        console.log(`Child process exited with code ${code}`);
      });

      // Optional: listen for any uncaught exceptions
      child.on('error', (err) => {
        console.error(`Failed to start subprocess: ${err}`);
        reject(err);
      });
    });
  }
  private async executeCommand1(command: string, rid: string) {
    return new Promise((resolve, reject) => {
      const child = exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${stderr}`);
          this.queueService.ownableFailed(rid, `Error executing command ${stderr} with error: ${error}`);
          return reject(error);
        }
        // console.log(stdout);
        resolve(stdout ? stdout : stderr);
      });

      // Listen for process exit
      child.on('exit', (code) => {
        console.log(`Child process exited with code ${code}`);
      });

      // Optional: listen for any uncaught exceptions
      child.on('error', (err) => {
        console.error(`Failed to start subprocess: ${err}`);
        reject(err);
      });
    });
  }
  // private async executeCommand(command: string) {
  //   return new Promise((resolve, reject) => {
  //     exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
  //       if (error) {
  //         console.log(`error: ${error.message}`);
  //         reject(new Error(`error: ${error.message}`));
  //         return;
  //       }
  //       resolve(stdout ? stdout : stderr);
  //     });
  //   });
  // }

  private async replaceLineInFile(file: string, key: string, value: string) {
    const data = readFileSync(file, 'utf8');
    var formatted = data.replace(key, value);
    writeFileSync(file, formatted, 'utf8');
  }

  private async watchFileCreation(fileName: string, jsonFile: any, nftInfo: NftInfo, sender: string, rid: string, verbose: boolean) {
    if (verbose) console.log(`Ownable creation startet. Waiting for Zip File ${fileName} to be created...`);
    let timeout = 0;
    while (!fileExists(fileName)) {
      this.wait(1000);
      timeout += 1;
      if (timeout >= 300) {
        break;
      }
    }

    if (verbose) console.log(`Zip File ${fileName} Created successfully.`);
    if (verbose) console.log("Unzipping to produce unique cid...");
    const cidFiles = await this.unzip(fileName);

    // adding a timestamp file to the Ownable to guarantee uniqueness for the CID
    const timeMillisecondsNow = Date.now().toString();
    cidFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

    if (verbose) console.log("getting unique chain ID from created ownable zip files ...");
    const cid = await this.getUniqueId(cidFiles);
    if (verbose) console.log("setCidNftInfo rid", rid);
    if (verbose) console.log("setCidNftInfo cid", cid);
    if (verbose) console.log("setCidNftInfo nftInfo", nftInfo);
    await this.queueService.setCidNftInfo(rid, cid, nftInfo);


    const ownableZip = `${this.pathToCids}/${cid}/${cid}.zip`;
    if (verbose) console.log("Storing new Ownable zip file and deleting the source Ownable zip ...");
    try {
      cpSync(fileName, ownableZip);
    } catch (err) {
      console.log("Error cpSync:", fileName, err);
    }

    try {
      rmSync(fileName);
    } catch (err) {
      console.log("Error rmSync1:", fileName, err);
    }
    try {
      rmSync(`ownables/${jsonFile.PLACEHOLDER1_NAME}`, { recursive: true });
    } catch (err) {
      console.log("Error rmSync2:", fileName, err);
    }

    if (verbose) console.log("Creating the EventChain for the new Ownable ...");
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

    const chainBuffer: Buffer = await this.createEventChain(pkgOwnable, nftInfo, sender); // sender from TX ID is new ownable owner
    //adding eventChain to cidFiles
    cidFiles.set('chain.json', chainBuffer);

    try {
      await this.storeFiles(`${this.pathToCids}/${cid}`, cid, cidFiles);
    } catch (err) {
      console.log("Error storeFiles:", err);
    }
    if (verbose) console.log("PATH", `${this.pathToCids}/${cid}`);

    var new_zip = new JSZip();

    const zipFile: Buffer = readFileSync(`${this.pathToCids}/${cid}/${cid}.zip`)
    await new_zip.loadAsync(zipFile);

    const eventChainJsonFile: Buffer = readFileSync(`${this.pathToCids}/${cid}/${cid}.json`)
    new_zip.file('chain.json', eventChainJsonFile);
    new_zip.file('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

    const content = await new_zip.generateAsync({ type: "uint8array" });

    await this.queueService.setQueueEntryStatus(rid, OwnableStatus.Ready);
    // await this.wait(20000); // TODO
    await this.storeZip(`${this.pathToCids}/${cid}`, cid, content);
    await this.sendOwnable(rid, sender, content);

  }


  private async startOwnableCreation(rid: string, jsonFile: any, nftInfo: NftInfo, sender: string, requestId: Map<string, Buffer>, verbose: boolean) {
    if (verbose) console.log("Starting Ownable creation");

    if (verbose) console.log("copying template 1 to template directory for modification");
    cpSync(`${this.pathToTemplates}/template1`, `ownables/${jsonFile.PLACEHOLDER1_NAME}`, { "recursive": true });
    console.log("requestId", requestId);
    console.log("PLACEHOLDER2_IMG", `${jsonFile.PLACEHOLDER2_IMG}`);
    console.log("OWNABLE_THUMBNAIL", `${jsonFile.OWNABLE_THUMBNAIL}`);
    if (verbose) console.log("copying image file into template");

    writeFileSync(`ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`, requestId.get(`${jsonFile.PLACEHOLDER2_IMG}`));
    // cpSync(`${this.pathToRids}/${rid}/${rid}/${jsonFile.PLACEHOLDER2_IMG}`, `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`);

    if (verbose) console.log("copying thumbnail image file into template");
    writeFileSync(`ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`, requestId.get(`${jsonFile.OWNABLE_THUMBNAIL}`));
    // cpSync(`${this.pathToRids}/${rid}/${rid}/${jsonFile.OWNABLE_THUMBNAIL}`, `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`);

    if (verbose) console.log("Replacing Placeholder texts of template with user input data");
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
    // if (verbose) console.log("copying modified template into ownables for ownable creation based on user inputs", `ownables/${jsonFile.PLACEHOLDER1_NAME}`);
    // cpSync(`${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`, `ownables/${jsonFile.PLACEHOLDER1_NAME}`, { "recursive": true });

    if (verbose) console.log("Checking Cargo, Wasm-Pack and Rustup existance...");
    try {
      const output = await this.executeCommand('cargo --version');
      if (verbose) console.log(output);
    } catch (error) {
      if (verbose) console.error('Cargo command failed, but essential for Ownable creation:', error);
      throw new Error(error);
    }
    try {
      const output = await this.executeCommand('rustup --version');
      if (verbose) console.log(output);
    } catch (error) {
      if (verbose) console.error('Rustup command failed, but essential for Ownable creation:', error);
      throw new Error(error);
    }
    try {
      const output = await this.executeCommand('wasm-pack --version');
      if (verbose) console.log(output);
    } catch (error) {
      if (verbose) console.error('Wasm-Pack command failed, but essential for Ownable creation:', error);
      throw new Error(error);
    }

    try {
      if (verbose) console.log("Building Ownable...");
      await this.executeCommand1(`npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`, rid);
    } catch (error) {
      if (verbose) console.error('npm run ownables command failed:', error);
      const output = await this.executeCommand(`rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME}`);
      if (verbose) console.log(output);
      throw new Error(error);
    }
    try {
      if (verbose) console.log("Starting file watcher for zip file:", `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`);
      await this.watchFileCreation(`ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`, jsonFile, nftInfo, sender, rid, verbose);
    } catch (err) {
      throw new Error(`Failed to watch File creation: ownables/${jsonFile.PLACEHOLDER1_NAME}.zip error: ${err}`);
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
