// import {
//   Inject,
//   Injectable,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import {
//   rmSync,
//   cpSync,
//   mkdirSync,
//   readFileSync,
//   writeFileSync,
//   readdirSync,
//   createWriteStream,
//   createReadStream,
// } from 'fs';
// import { ConfigService } from '../common/config/config.service';
// import arrayToString from '../utils/arrayToString';
// import JSZip from 'jszip';
// import fileExists from '../utils/fileExists';
// import path from 'path';
// import { HttpService } from '@nestjs/axios';
// import {
//   Account,
//   Binary,
//   LTO,
//   Transaction,
//   Event,
//   EventChain,
//   Message,
//   Relay,
// } from '@ltonetwork/lto';
// import { exec } from 'child_process';
// import chokidar from 'chokidar';
// import { NftInfo, OwnableInfo } from '../interfaces/OwnableInfo';
// import { TransactionIdData } from '../interfaces/TransactionIdData';
// import { TypedPackage } from '../interfaces/TypedPackage';
// import { NFTService } from '../nft/nft.service';
// import { IEventChainJSON } from '@ltonetwork/lto/interfaces';
// import { throwError } from 'rxjs';
// import { Blob } from 'buffer';
// import { PinataSDK } from 'pinata';
// import { QueueService } from '../services/Queue.service';
// import { InfoService } from '../info/info.service';
// import { RedisService } from '../common/redis/redis.service';
// import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';

// @Injectable()
// export class UploadZipService implements OnModuleInit, OnModuleDestroy {
//   private pathToRids: string;
//   private pathToCids: string;
//   private pathToUserRids: string;
//   private pathToUsedTxids: string;
//   private pathToTemplates: string;
//   private packageInfo: any;
//   private intervalId: NodeJS.Timeout;
//   private queueBusyTimer: number = 0;
//   private queueCurrentlyProcessedRequestId: string = '';
//   private lto = new LTO(this.config.get('lto.networkId'));
//   private readonly _ltoAccount?: Account = this.lto.account({
//     seed: this.config.get('lto.account.seed'),
//   });
//   public readonly networkId = this.lto.networkId;
//   private nodeVersion = process.version;
//   private pinata = new PinataSDK({
//     pinataJwt: this.config.get('pinata.jwt'), // process.env.PINATA_JWT!,
//     pinataGateway: this.config.get('pinata.gateway'), // "example-gateway.mypinata.cloud",
//   });

//   constructor(
//     private readonly httpService: HttpService,
//     private readonly config: ConfigService,
//     // private readonly zip: JSZip,
//     private nft: NFTService,
//     private readonly queueService: QueueService,
//     private readonly infoService: InfoService,
//     private readonly rabbitMQService: RabbitMQService,
//     private readonly redisService: RedisService,
//     @Inject('IPFS') private readonly ipfs: IPFS,
//   ) {}

//   async onModuleInit() {
//     this.packageInfo = require('../../package.json');
//     this.pathToRids = this.packageInfo.ownableRidPath;
//     this.pathToCids = this.packageInfo.ownableCidPath;
//     this.pathToUserRids = this.packageInfo.userRidsPath;
//     this.pathToUsedTxids = this.packageInfo.usedTxidsPath;
//     this.pathToTemplates = this.packageInfo.ownableTemplatesPath;
//     mkdirSync(this.pathToRids, { recursive: true });
//     mkdirSync(this.pathToCids, { recursive: true });
//     mkdirSync(this.pathToUserRids, { recursive: true });
//     mkdirSync(this.pathToUsedTxids, { recursive: true });
//     // console.log("NODE", this.config.get('lto.node'));
//     // console.log("NODE_ENV", this.config.get('env'));
//     // this.intervalId = setInterval(() => {
//     //   this.checkQueueStatus();
//     // }, 10000); // 10000 ms = 10 seconds

//     this.rabbitMQService.consumeQueue('taskQueue', async (msg) => {
//       const { requestId, data } = msg;
//       //await this.startBuild(requestId, Uint8Array.from(data));
//     });
//   }

//   // Stop the interval when the application shuts down
//   onModuleDestroy() {
//     if (this.intervalId) {
//       clearInterval(this.intervalId);
//     }
//   }

//   async processRequest(
//     requestId: string,
//     data: Uint8Array,
//     walletAddress: string,
//   ) {
//     // Set initial status in Redis
//     await this.redisService.set(requestId, {
//       requestId,
//       status: 'processing',
//       date: new Date().toISOString(),
//       walletAddress,
//     });

//     // Publish to RabbitMQ queue for processing
//     await this.rabbitMQService.publishToQueue('taskQueue', {
//       requestId,
//       data: Array.from(data),
//     });

//     await this.store(requestId, data, 1, true);
//   }

//   async updateRequestStatus(requestId: string, status: string) {
//     await this.redisService.updateStatus(requestId, status);
//   }

//   public async sendFile(
//     relay,
//     content: Uint8Array,
//     sender: Account,
//     recipient: string,
//   ) {
//     try {
//       let message: Message;
//       if (sender && recipient) {
//         message = new Message(content).to(recipient).signWith(sender);
//       } else {
//         console.log('provide the signer and recipient');
//         return;
//       }
//       await relay.send(message);
//     } catch {
//       return true;
//     }
//   }

//   public async sendOwnable(recipient: string, content?: Uint8Array) {
//     const relayURL = this.infoService.getRelayUrl();
//     this.lto.relay = new Relay(`${relayURL}`);
//     const relay = this.lto.relay;
//     const sender: Account = this._ltoAccount;
//     try {
//       if (recipient) {
//         // await sendFile(
//         //   relay,
//         //   content,
//         //   sender,
//         //   recipient
//         // );
//         await this.sendFile(relay, content, sender, recipient);
//       } else {
//         throw new Error('No recipient provided');
//       }
//     } catch (error) {
//       throw new Error(`Error sending message: ${error}`);
//     }
//   }

//   public getLTOAccount(): Account {
//     if (!this._ltoAccount) {
//       throw new Error('Not logged in');
//     }
//     return this._ltoAccount;
//   }

//   async existsRid(rid: string): Promise<boolean> {
//     return await fileExists(`${this.pathToRids}/${rid}`);
//   }

//   async existsRidTemplate(rid: string): Promise<boolean> {
//     return await fileExists(`${this.pathToRids}/${rid}/${rid}_template`);
//   }
//   async existsCid(cid: string): Promise<boolean> {
//     return await fileExists(`${this.pathToCids}/${cid}/${cid}.zip`);
//   }

//   private async checkReuseOfTxId(ltoTransactionId: string, requestId: string) {
//     console.log(
//       `Checking if TX ID ${ltoTransactionId} has already been used for a previous request`,
//     );
//     if (fileExists(`${this.pathToUsedTxids}/`)) {
//       console.log(`Directory exists: ${this.pathToUsedTxids}/`);
//       const files = readdirSync(`${this.pathToUsedTxids}/`);
//       let myReg = new RegExp(`${ltoTransactionId}_`, 'g');

//       files.forEach((file) => {
//         if (file.match(myReg)) {
//           const filesArray = file.split('_');
//           if (filesArray[1] === requestId) {
//             console.log('TX ID matches previous request ID - OK');
//           } else {
//             throw `LTO TX ID ${ltoTransactionId} has already been used with request ID: ${filesArray[1]}`;
//           }
//         }
//       });
//     }

//     // Link request ID to this lto TX ID to prevent using TX ID twice for another ownable creation request
//     await this.executeCommand(
//       `touch ${this.pathToUsedTxids}/${ltoTransactionId}_${requestId}`,
//     );
//   }

//   private async checkLtoTransactionId(
//     ltoTransactionId: string,
//     templateId: number,
//     chain: String,
//     requestId: string,
//   ): Promise<TransactionIdData> {
//     // FIRST WORKING METHOD
//     console.log(
//       'HTTP Request sent to:',
//       `${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`,
//     );
//     const data = await this.httpService.axiosRef
//       .get(
//         `${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`,
//       )
//       .then((res) => res.data)
//       .catch((err) => {
//         throw new Error(
//           err?.message + ': ' + JSON.stringify(err?.response?.data),
//         );
//       });
//     // SECOND WORKING METHOD
//     // const { data } = await firstValueFrom(
//     //   this.httpService.get(`${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`).pipe(
//     //     catchError((error: AxiosError) => {
//     //       //this.logger.error(error.response.data);
//     //       throw 'An error happened!';
//     //     }),
//     //   ),
//     // );

//     // THIRD WORKING METHOD - requires node >= v18
//     // const url = `${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`;
//     // const response = await fetch(url);
//     // const data = await response.json();

//     const thisServerAddress = this.infoService.getLTOAccountAddress();

//     // Must be of type "transaction"
//     if (data.type != 4) throw 'Wrong Transaction type';
//     if (
//       this.packageInfo.templateCost[chain.toString()][templateId] === undefined
//     )
//       throw `Undefined templateCost for chain ${chain}`;
//     //check for correct amount and correct recipient (this servers' LTO wallet)
//     console.log('data.fee', data.fee.toString());
//     console.log('data.amount', data.amount.toString());
//     console.log(
//       'Template Cost',
//       this.packageInfo.templateCost[chain.toString()][templateId].toString(),
//     );

//     if (
//       data.amount.toString() !==
//       this.packageInfo.templateCost[chain.toString()][templateId].toString()
//     ) {
//       console.log(
//         'templateCost',
//         this.packageInfo.templateCost[chain.toString()][templateId].toString(),
//       );
//       console.log('amount sent', data.amount.toString());
//       throw 'Wrong LTO amount for Template';
//     }
//     if (data.recipient != thisServerAddress) {
//       console.log('thisServerAddress', thisServerAddress);
//       console.log('data.recipient', data.recipient);
//       throw 'Wrong recipient! Use Server LTO Wallet address';
//     }

//     await this.checkReuseOfTxId(ltoTransactionId, requestId);
//     // Link request ID to this lto TX ID to prevent using TX ID twice for another ownable creation request
//     await this.executeCommand(
//       `touch ${this.pathToUsedTxids}/${ltoTransactionId}_${requestId}`,
//     );

//     return {
//       type: data.type,
//       sender: data.sender,
//       recipient: data.recipient,
//       amount: data.amount,
//     };
//   }

//   async getCIDs() {
//     let cids: string[] = new Array();
//     try {
//       const files = readdirSync(`${this.pathToCids}/`);
//       files.forEach((file) => {
//         cids.push(file);
//       });
//     } catch (err) {
//       console.log(err);
//     }
//     return cids;
//   }

//   // async getRequestIDs(ltoUserAddress?: string): Promise<string[]> {
//   //   let requestIDs: string[] = new Array();

//   //   if (ltoUserAddress === undefined) {
//   //     // TODO: this should be removed.. actually only the http signer should be allowed!
//   //     console.log(
//   //       'No LTO user address specified. Fetching all available request IDs on server',
//   //     );
//   //     try {
//   //       const files = readdirSync(`${this.pathToRids}/`);
//   //       files.forEach((file) => {
//   //         requestIDs.push(file);
//   //       });
//   //     } catch (err) {
//   //       console.log(err);
//   //     }
//   //   } else {
//   //     try {
//   //       if (!(await fileExists(`${this.pathToUserRids}/${ltoUserAddress}`))) {
//   //         throw `No entries for LTO user address: ${ltoUserAddress}`;
//   //       }
//   //       console.log(
//   //         `Fetching available request IDs for LTO user address: ${ltoUserAddress}`,
//   //       );
//   //       const files = readdirSync(`${this.pathToUserRids}/${ltoUserAddress}/`);
//   //       files.forEach((file) => {
//   //         if (file.match(/_startet$/g)) {
//   //           requestIDs.push(file.replace('_startet', ''));
//   //         }
//   //       });
//   //     } catch (err) {
//   //       console.log(err);
//   //     }
//   //   }
//   //   return requestIDs;
//   // }

//   private async createEventChain(
//     pkg: TypedPackage,
//     nftInfo: NftInfo,
//     sender: string,
//   ): Promise<Buffer> {
//     const chain = new EventChain(this._ltoAccount);
//     var buf: Buffer;
//     if (pkg.isDynamic) {
//       let msg;
//       if (nftInfo.id != 0) {
//         msg = {
//           '@context': 'instantiate_msg.json',
//           ownable_id: chain.id,
//           package: pkg.cid,
//           network_id: this.networkId,
//           keywords: pkg.keywords,
//           nft: {
//             network: nftInfo.network,
//             id: nftInfo.id.toString(),
//             address: nftInfo.address,
//           },
//         };
//       } else {
//         msg = {
//           '@context': 'instantiate_msg.json',
//           ownable_id: chain.id,
//           package: pkg.cid,
//           network_id: this.networkId,
//           keywords: pkg.keywords,
//         };
//       }

//       new Event(msg).addTo(chain).signWith(this._ltoAccount);

//       new Event({ '@context': 'execute_msg.json', transfer: { to: sender } })
//         .addTo(chain)
//         .signWith(this._ltoAccount);
//       // console.log("CHAIN2:", JSON.stringify(chain));
//       // console.log("CHAIN3:", chain);

//       // TODO: THIS NEEDS TO BE ENABLED !
//       const appendedEvents = chain.startingWith(chain.events[0]);
//       const anchorMap1 = appendedEvents.anchorMap;
//       await this.lto.anchor(this._ltoAccount, ...anchorMap1);

//       chain.validate();
//       const genesisSigner = this.lto.account(chain.events[0].signKey);
//       if (!chain.isCreatedBy(genesisSigner))
//         throw new Error(
//           'Event chain hijacking: genesis event not signed by chain creator',
//         );
//       else {
//         console.log(
//           'All good! Genesis signer correct after creating the Ownable',
//         );
//       }

//       writeFileSync(
//         `${this.pathToCids}/${pkg.cid}/${pkg.cid}.json`,
//         JSON.stringify(chain),
//       );

//       const file = readFileSync(
//         `${this.pathToCids}/${pkg.cid}/${pkg.cid}.json`,
//         { encoding: 'utf8' },
//       );
//       buf = Buffer.from(file, 'utf8');

//       // Checking the import of the EvenChain json if this still works (e.g. for ownables-sdk)
//       const data: IEventChainJSON = JSON.parse(JSON.stringify(chain));
//       const chain1 = EventChain.from(data);
//       chain1.validate();
//       if (!chain1.isCreatedBy(genesisSigner))
//         throw new Error(
//           'Event chain hijacking: genesis event not signed by chain creator',
//         );
//       else {
//         console.log(
//           'All good! Genesis signer correct after reading EventChain from disk',
//         );
//       }
//     }

//     return buf;
//   }

//   private async readOwnableDataFromZip(files: Map<string, Buffer>) {
//     try {
//       return JSON.parse(files.get('ownableData.json').toString())[0];
//     } catch (error) {
//       throw `Failed to read JSON file ownableData.json`;
//     }
//   }

//   public async createPinataPinnedFile(picture: Buffer): Promise<string> {
//     // public async createPinataPinnedFile(): Promise<string> {
//     // const rid = 'bafybeibpmdydk2mhbak2ffhptws24nffzrqyfeby45k4tu55udoomjkk5u';
//     // const picture: Buffer = readFileSync(`${this.pathToRids}/${rid}/${rid}/new-thumb-test.webp`);
//     // const nftInfo: NftInfo = {
//     //   network: "ethereum",
//     //   address: "0x0",
//     //   id: 1
//     // }

//     let blobPicture: Blob;
//     const pinataMetadata = JSON.stringify({
//       name: 'PictureNFT',
//     });
//     const pinataOptions = JSON.stringify({
//       cidVersion: 1,
//     });
//     const JWT = this.config.get('pinata.jwt');

//     blobPicture = new Blob([picture]);
//     const formDataPicture = new FormData();

//     if (this.nodeVersion.startsWith('v18.')) {
//       formDataPicture.append('file', blobPicture);
//     } else if (this.nodeVersion.startsWith('v20.')) {
//       const fileBlob = new File([blobPicture], 'OwnableNftPicture', {
//         type: 'image/webp',
//       });
//       formDataPicture.append('file', fileBlob);
//     }

//     formDataPicture.append('pinataMetadata', pinataMetadata);
//     formDataPicture.append('pinataOptions', pinataOptions);

//     const requestPicture = await fetch(
//       'https://api.pinata.cloud/pinning/pinFileToIPFS',
//       {
//         method: 'POST',
//         headers: {
//           Authorization: `Bearer ${JWT}`,
//         },
//         body: formDataPicture,
//       },
//     );
//     const responsePicture = await requestPicture.json();
//     // console.log(response);
//     // https://black-rigid-chickadee-743.mypinata.cloud/ipfs/bafkreierxsqjdhgs576mc76idbm2wqhzmjc4uqvalw2fkm43xzjj7247wi

//     const pinata_gateway_url = this.config.get('pinata.gateway');
//     // console.log("1 pinata_gateway_url", pinata_gateway_url);
//     // console.log("1 file", `${pinata_gateway_url}/ipfs/${response.IpfsHash}`);

//     let blobJson: Blob;
//     const jsonTest = {
//       nftImage: `${pinata_gateway_url}/ipfs/${responsePicture.IpfsHash}`,
//     };

//     var buf = Buffer.from(JSON.stringify(jsonTest));

//     blobJson = new Blob([buf]);
//     const formDataJson = new FormData();

//     if (this.nodeVersion.startsWith('v18.')) {
//       formDataJson.append('file', blobJson);
//     } else if (this.nodeVersion.startsWith('v20.')) {
//       const fileBlob = new File([blobJson], 'OwnableNftJson', {
//         type: 'application/json',
//       });
//       formDataJson.append('file', fileBlob);
//     }

//     formDataJson.append('pinataMetadata', pinataMetadata);
//     formDataJson.append('pinataOptions', pinataOptions);

//     const requestJson = await fetch(
//       'https://api.pinata.cloud/pinning/pinFileToIPFS',
//       {
//         method: 'POST',
//         headers: {
//           Authorization: `Bearer ${JWT}`,
//         },
//         body: formDataJson,
//       },
//     );
//     const responseJson = await requestJson.json();
//     console.log('response1', responseJson);

//     return `${pinata_gateway_url}/ipfs/${responseJson.IpfsHash}`;
//   }
//   private async mintNewNft(jsonFile: any, verbose: boolean): Promise<NftInfo> {
//     let nftNetwork: string;
//     let nftContractAddress: string;
//     if (jsonFile.NFT_BLOCKCHAIN === 'ethereum') {
//       nftContractAddress = this.config.get('eth.contracts.ethereum');
//       nftNetwork = 'ethereum';
//     } else if (jsonFile.NFT_BLOCKCHAIN === 'arbitrum') {
//       nftContractAddress = this.config.get('eth.contracts.arbitrum');
//       nftNetwork = 'arbitrum';
//     } else {
//       throw `Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`;
//     }
//     // else if (jsonFile.NFT_BLOCKCHAIN === 'polygon') {
//     //   nftContractAddress = this.config.get('eth.contracts.polygon');
//     //   nftNetwork = "polygon";
//     // }
//     if (verbose)
//       console.log(`minting via NFT contract at: ${nftContractAddress} `);

//     // const nftOwner = jsonFile.NFT_PUBLIC_USER_WALLET_ADDRESS;
//     const nftReceiverAddress = this.config.get(
//       'eth.account.obridge_wallet_address',
//     );

//     // const upload = await this.pinata.upload.json({
//     //   id: 2,
//     //   name: "Bob Smith",
//     //   email: "bob.smith@example.com",
//     //   age: 34,
//     //   isActive: false,
//     //   roles: ["user"]
//     // })

//     const nftTokenURI = jsonFile.NFT_TOKEN_URI;

//     if (verbose) console.log('nftOwner', nftReceiverAddress);
//     if (verbose) console.log('nftTokenURI', nftTokenURI);
//     if (verbose) console.log('NFT_BLOCKCHAIN', jsonFile.NFT_BLOCKCHAIN);

//     const nftInfo: NftInfo = {
//       network: nftNetwork,
//       address: nftContractAddress,
//       id: 0, // id is not used when minting a new NFT
//     };

//     const nftcount = await this.nft.mintNFT(
//       nftReceiverAddress,
//       nftTokenURI,
//       nftInfo,
//     );
//     if (verbose) console.log('nftcount', nftcount);
//     nftInfo.id = nftcount;
//     return nftInfo;
//   }
//   // public async queueRequest(
//   //   uint8ArrayData: Uint8Array,
//   //   templateId: number,
//   //   signer?: Account,
//   //   verbose?: boolean,
//   // ): Promise<any> {
//   //   // TODO: adding signed request and reading info from Header inside controller logic
//   //   console.log('HTTP Authentication SIGNER: ', signer);
//   //   if (typeof signer !== 'undefined') {
//   //     console.log('HTTP Authentication SIGNER LTO ADDRESS: ', signer.address);
//   //   } else {
//   //     // throw ('Undefined HTTP Authentication SIGNER LTO Wallet Address!');
//   //   }

//   //   if (!this.queueService.isQueueingAllowed()) {
//   //     throw 'Queueing of new Requests currently disabled!';
//   //   }

//   //   if (verbose) console.log('unzipping user input file into memory...');
//   //   const requestIdFiles = await this.unzip(uint8ArrayData);
//   //   console.log('requestIdFiles', requestIdFiles);

//   //   if (verbose) console.log('getting request ID of input requestIdFiles...');
//   //   const requestId: string = await this.getUniqueId(requestIdFiles);

//   //   this.queueService.enqueue(requestId, uint8ArrayData);

//   //   return {
//   //     REQUEST_ID: requestId,
//   //   };
//   // }

//   // public getQueueRequestIDs(): string[] {
//   //   const isEmpty = this.queueService.isQueueEmpty();
//   //   if (isEmpty) {
//   //     return [];
//   //   } else {
//   //     return this.queueService.getRequestIdList();
//   //   }
//   // }
//   // private async checkQueueStatus() {
//   //   const isEmpty = this.queueService.isQueueEmpty();
//   //   if (isEmpty) {
//   //     console.log('Queue is empty.');
//   //   } else {
//   //     console.log('Queue is not empty.');

//   //     if (!this.queueService.isCreatingOwnable()) {
//   //       console.log(
//   //         'Waiting 10 seconds for a possible TX ID that needs to be populated into LTO node network...',
//   //       );
//   //       await this.wait(10000);

//   //       const [requestId, data] = this.queueService.dequeue();
//   //       this.queueBusyTimer = 0;
//   //       this.queueCurrentlyProcessedRequestId = requestId.toString();
//   //       await this.store(data, 1, true);
//   //     }
//   //   }

//   //   if (this.queueService.isCreatingOwnable()) {
//   //     this.queueBusyTimer += 1;
//   //   }

//   //   const queueingAllowed = this.config.get('lto.queue');
//   //   this.queueService.allowQueueing(queueingAllowed);

//   //   // this check is only required in case the Ownable creation fails for some reason and isCreatingOwnable is still true
//   //   if (this.queueBusyTimer >= 30) {
//   //     // 10 sec * 30 = 5 Minutes
//   //     this.queueService.creatingOwnable(false);
//   //     this.queueBusyTimer = 0;
//   //     this.queueCurrentlyProcessedRequestId = '';
//   //   }
//   // }

//   // public queueStatus(): any {
//   //   let isOwnableBeingBuild: boolean = false;
//   //   let isQueueingAllowed: boolean;
//   //   let currentlyProcessedRequestId = '';

//   //   if (this.queueService.isCreatingOwnable()) {
//   //     isOwnableBeingBuild = true;
//   //     currentlyProcessedRequestId = this.queueCurrentlyProcessedRequestId;
//   //   }
//   //   isQueueingAllowed = this.queueService.isQueueingAllowed();
//   //   const timeElapsed = this.queueBusyTimer * 10; // queueBusytimer is increased each 10 seconds by one
//   //   return {
//   //     CREATING_OWNABLE: isOwnableBeingBuild,
//   //     REQUEST_ID: currentlyProcessedRequestId.toString(),
//   //     QUEUEING_ALLOWED: isQueueingAllowed,
//   //     TIME_ELAPSED: timeElapsed.toString(),
//   //   };
//   // }

//   private wait = (n: number) =>
//     new Promise((resolve) => setTimeout(resolve, n));

//   // 1) unzip user input zip file into memory
//   // 2)
//   // public async store(data: Uint8Array, templateId: number, verbose?: boolean) {
//   //   // console.log("HTTP Authentication SIGNER: ", signer);
//   //   // if (typeof signer !== 'undefined') {
//   //   //   console.log("HTTP Authentication SIGNER LTO ADDRESS: ", signer.address);
//   //   // } else {
//   //   //   // throw ('Undefined HTTP Authentication SIGNER LTO Wallet Address!');
//   //   // }
//   //   //this.queueService.creatingOwnable(true);

//   //   try {
//   //     // console.log("data", data);
//   //     if (verbose) console.log('unzipping user input file into memory...');
//   //     const requestIdFiles = await this.unzip(data);
//   //     console.log('requestIdFiles', requestIdFiles);

//   //     if (verbose) console.log('getting request ID of input requestIdFiles...');
//   //     const requestId: string = await this.getUniqueId(requestIdFiles);
//   //     if (verbose) console.log('Unique request ID:', requestId);

//   //     // if (!(await this.existsRid(requestId))) {
//   //     if (verbose) console.log('checking for userOwnable.json existance...');
//   //     if (!requestIdFiles.has('ownableData.json'))
//   //       throw new Error("Invalid package: 'ownableData.json' is missing");

//   //     if (verbose)
//   //       console.log(
//   //         'reading JSON info data from zip for Ownable modification...',
//   //       );
//   //     const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
//   //     if (verbose) console.log('ownableData.json', jsonFile);
//   //     if (jsonFile.CREATE_NFT === 'true') {
//   //       if (
//   //         !(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') &&
//   //         !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')
//   //       ) {
//   //         throw new Error(
//   //           `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`,
//   //         );
//   //       }
//   //     } else {
//   //       jsonFile.NFT_BLOCKCHAIN = 'noNFT';
//   //     }
//   //     if (verbose)
//   //       console.log('LTO ACCOUNT:', this.infoService.getLTOAccountAddress());
//   //     if (verbose)
//   //       console.log(
//   //         'checking LTO transaction ID...',
//   //         jsonFile.OWNABLE_LTO_TRANSACTION_ID,
//   //       );

//   //     const transactionIdData: TransactionIdData =
//   //       await this.checkLtoTransactionId(
//   //         jsonFile.OWNABLE_LTO_TRANSACTION_ID,
//   //         templateId,
//   //         jsonFile.NFT_BLOCKCHAIN,
//   //         requestId,
//   //       );
//   //     if (verbose) console.log('transactionIdData:', transactionIdData);

//   //     if (
//   //       !(await this.existsRid(
//   //         `${this.pathToUserRids}/${transactionIdData.sender}`,
//   //       ))
//   //     ) {
//   //       mkdirSync(`${this.pathToUserRids}/${transactionIdData.sender}`, {
//   //         recursive: true,
//   //       });
//   //     } else {
//   //       if (verbose)
//   //         console.log(
//   //           'Path already exists:',
//   //           `${this.pathToUserRids}/${transactionIdData.sender}`,
//   //         );
//   //     }

//   //     // if (await this.existsRidTemplate(requestId)) return requestId;

//   //     if (verbose)
//   //       console.log('Skip storing request ID files if already exist...');
//   //     if (verbose) console.log('file exists?', await this.existsRid(requestId));

//   //     await this.storeFiles(
//   //       `${this.pathToRids}/${requestId}`,
//   //       requestId,
//   //       requestIdFiles,
//   //     );
//   //     await this.storeZip(`${this.pathToRids}/${requestId}`, requestId, data);
//   //     // Before creating the Ownable a new NFT is minted with NFT id and the user NFT input data is checked

//   //     let nftInfo: NftInfo;

//   //     if (jsonFile.CREATE_NFT === 'true') {
//   //       const picture: Buffer = readFileSync(
//   //         `${this.pathToRids}/${requestId}/${requestId}/${jsonFile.PLACEHOLDER2_IMG}`,
//   //       );
//   //       jsonFile.NFT_TOKEN_URI = await this.createPinataPinnedFile(picture);

//   //       nftInfo = await this.mintNewNft(jsonFile, verbose);
//   //       jsonFile.PLACEHOLDER1_KEYWORDS.push('hasNFT');
//   //     } else {
//   //       nftInfo = {
//   //         network: '',
//   //         address: '',
//   //         id: 0, // 1, 2, 3
//   //       };
//   //       jsonFile.PLACEHOLDER1_KEYWORDS.push('noNFT');
//   //     }
//   //     if (verbose)
//   //       console.log(
//   //         `creating template with request ID ${requestId} and modifying requestIdFiles...`,
//   //       );
//   //     await this.startOwnableCreation(
//   //       requestId,
//   //       jsonFile,
//   //       nftInfo,
//   //       transactionIdData.sender,
//   //       verbose,
//   //     );
//   //     await this.executeCommand(
//   //       `touch ${this.pathToUserRids}/${transactionIdData.sender}/${requestId}_startet`,
//   //     );

//   //     // }
//   //     // else {
//   //     //   console.log(`Request ID for this Ownable create request does already exist: ${requestId}`);
//   //     // }

//   //     // return requestId;
//   //   } catch (err) {
//   //     throw err;
//   //   }
//   // }
//   public async store(
//     requestId: string,
//     data: Uint8Array,
//     templateId: number,
//     verbose?: boolean,
//   ) {
//     try {
//       if (verbose) console.log('Unzipping user input file into memory...');
//       const requestIdFiles = await this.unzip(data);
//       //const requestId: string = await this.getUniqueId(requestIdFiles);

//       if (verbose) console.log('Unique request ID:', requestId);

//       if (!requestIdFiles.has('ownableData.json')) {
//         throw new Error("Invalid package: 'ownableData.json' is missing");
//       }

//       const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
//       await this.redisService.set(`${requestId}:metadata`, jsonFile);
//       await this.redisService.updateStatus(requestId, 'metadata_stored');

//       if (jsonFile.CREATE_NFT === 'true') {
//         if (
//           !(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') &&
//           !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')
//         ) {
//           throw new Error(
//             `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`,
//           );
//         }
//       } else {
//         jsonFile.NFT_BLOCKCHAIN = 'noNFT';
//       }

//       const transactionIdData: TransactionIdData =
//         await this.checkLtoTransactionId(
//           jsonFile.OWNABLE_LTO_TRANSACTION_ID,
//           templateId,
//           jsonFile.NFT_BLOCKCHAIN,
//           requestId,
//         );

//       await this.redisService.set(
//         `${requestId}:transactionData`,
//         transactionIdData,
//       );
//       await this.redisService.updateStatus(requestId, 'transaction_validated');

//       await this.redisService.set(
//         `${requestId}:files`,
//         Array.from(requestIdFiles.entries()),
//       );

//       // Example NFT handling
//       let nftInfo: NftInfo;
//       if (jsonFile.CREATE_NFT === 'true') {
//         const picture = await this.createPinataPinnedFile(Buffer.from(data));
//         jsonFile.NFT_TOKEN_URI = picture;
//         nftInfo = await this.mintNewNft(jsonFile, verbose);
//         jsonFile.PLACEHOLDER1_KEYWORDS.push('hasNFT');
//       } else {
//         nftInfo = { network: '', address: '', id: 0 };
//         jsonFile.PLACEHOLDER1_KEYWORDS.push('noNFT');
//       }

//       await this.redisService.set(`${requestId}:nftInfo`, nftInfo);
//       await this.redisService.updateStatus(requestId, 'nft_data_stored');

//       await this.startOwnableCreation(
//         requestId,
//         jsonFile,
//         nftInfo,
//         transactionIdData.sender,
//         verbose,
//       );

//       await this.redisService.updateStatus(requestId, 'build_complete');
//     } catch (err) {
//       await this.redisService.updateStatus(requestId, `error: ${err.message}`);
//       throw err;
//     }
//   }

//   private async executeCommand(command: string) {
//     return new Promise((resolve, reject) => {
//       exec(
//         command,
//         {
//           env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` },
//         },
//         (error, stdout, stderr) => {
//           if (error) {
//             console.log(`error: ${error.message}`);
//             reject(new Error(`error: ${error.message}`));
//             return;
//           }
//           resolve(stdout ? stdout : stderr);
//         },
//       );
//     });
//   }
//   // private async executeCommand(command: string) {
//   //   return new Promise((resolve, reject) => {
//   //     exec(command, (error, stdout, stderr) => {
//   //       if (error) {
//   //         console.log(`error: ${error.message}`);
//   //         throw new Error(`error: ${error.message}`);
//   //       }
//   //       resolve(stdout ? stdout : stderr);
//   //     });
//   //   });
//   // }

//   private async replaceLineInFile(file: string, key: string, value: string) {
//     const data = readFileSync(file, 'utf8');
//     var formatted = data.replace(key, value);
//     writeFileSync(file, formatted, 'utf8');
//   }

//   private async watchFileCreation(
//     fileName: string,
//     jsonFile: any,
//     nftInfo: NftInfo,
//     sender: string,
//     rid: string,
//     verbose: boolean,
//   ) {
//     if (verbose) console.log('watching for file creation ', fileName);
//     const watcher = chokidar.watch(fileName).on('add', async (event, path1) => {
//       if (verbose)
//         console.log('Watcher: created Ownable Zip File done:', event);

//       if (verbose)
//         console.log('unzipping the created ownable to produce unique cid...');
//       const cidFiles = await this.unzip(event);

//       if (verbose)
//         console.log(
//           'getting unique chain ID from created ownable zip files ...',
//         );
//       const cid = await this.getUniqueId(cidFiles);

//       const ownableZip = `${this.pathToCids}/${cid}/created_ownable.zip`;
//       if (verbose)
//         console.log(
//           'Storing new Ownable zip file and deleting the source Ownable zip ...',
//         );
//       try {
//         cpSync(event, ownableZip);
//       } catch (err) {
//         console.log('Error cpSync:', event, err);
//       }

//       try {
//         rmSync(event);
//       } catch (err) {
//         console.log('Error rmSync1:', event, err);
//       }
//       try {
//         rmSync(`ownables/${jsonFile.PLACEHOLDER1_NAME}`, { recursive: true });
//       } catch (err) {
//         console.log('Error rmSync2:', event, err);
//       }

//       if (verbose)
//         console.log('Creating the EventChain for the new Ownable ...');
//       const pkgOwnable: TypedPackage = {
//         isDynamic: true,
//         hasMetadata: false,
//         hasWidgetState: false,
//         isConsumable: false,
//         isConsumer: false,
//         isTransferable: true,
//         title: jsonFile.PLACEHOLDER2_TITLE.toString(),
//         name: jsonFile.PLACEHOLDER1_NAME.toString(),
//         description: jsonFile.PLACEHOLDER1_DESCRIPTION.toString(),
//         cid: `${cid}`,
//         versions: [jsonFile.PLACEHOLDER1_VERSION.toString()],
//         keywords: jsonFile.PLACEHOLDER1_KEYWORDS,
//       };

//       const chainBuffer: Buffer = await this.createEventChain(
//         pkgOwnable,
//         nftInfo,
//         sender,
//       ); // sender from TX ID is new ownable owner
//       //adding eventChain to cidFiles
//       cidFiles.set('chain.json', chainBuffer);
//       try {
//         await this.storeFiles(`${this.pathToCids}/${cid}`, cid, cidFiles);
//       } catch (err) {
//         console.log('Error storeFiles:', err);
//       }
//       try {
//         cpSync(ownableZip, `${this.pathToCids}/${cid}/${cid}.zip`);
//       } catch (err) {
//         console.log('Error cpSync:', err);
//       }
//       try {
//         rmSync(ownableZip);
//       } catch (err) {
//         console.log('Error rmSync:', err);
//       }
//       if (verbose) console.log('PATH', `${this.pathToCids}/${cid}`);

//       var new_zip = new JSZip();

//       const zipFile: Buffer = readFileSync(
//         `${this.pathToCids}/${cid}/${cid}.zip`,
//       );
//       await new_zip.loadAsync(zipFile);

//       const eventChainJsonFile: Buffer = readFileSync(
//         `${this.pathToCids}/${cid}/${cid}.json`,
//       );
//       new_zip.file('chain.json', eventChainJsonFile);

//       const claimableZipFile = `${this.pathToRids}/${rid}/${rid}_claim.zip`;

//       const nftToCidMappingFile = `${this.pathToCids}/${cid}/${nftInfo.network}_${nftInfo.address}_${nftInfo.id}_${cid}_mapped`;
//       try {
//         await this.executeCommand(`touch ${nftToCidMappingFile}`);
//       } catch (err) {
//         console.log('Error executeCommand touch:', err);
//       }
//       const content = await new_zip.generateAsync({ type: 'uint8array' });
//       if (verbose) console.log('claimFile', claimableZipFile);
//       if (verbose) console.log('rid', rid);
//       try {
//         writeFileSync(claimableZipFile, content);
//       } catch (err) {
//         console.log('Error writeFileSync:', err);
//       }
//       const claimableInfo = {
//         RID: rid.toString(),
//         CID: cid.toString(),
//         NAME: jsonFile.PLACEHOLDER1_NAME.toString(),
//         description: jsonFile.PLACEHOLDER1_DESCRIPTION.toString(),
//         NFT_BLOCKCHAIN: jsonFile.NFT_BLOCKCHAIN.toString(),
//         NFT_ID: nftInfo.id.toString(),
//         NFT_TOKEN_URI: jsonFile.NFT_TOKEN_URI.toString(),
//         CLAIMED: false,
//       };
//       const claimableFile = `${this.pathToUserRids}/${sender}/${rid}_claimable`;
//       try {
//         writeFileSync(claimableFile, JSON.stringify(claimableInfo));
//       } catch (err) {
//         console.log('Error writeFileSync:', err);
//       }
//       try {
//         await this.executeCommand(
//           `touch ${this.pathToRids}/${rid}/${sender}_USER`,
//         );
//       } catch (err) {
//         console.log('Error executeCommand touch:', err);
//       }

//       watcher.unwatch(fileName);

//       // sendOwnable(recipient: string, content?: Uint8Array);
//       console.log('CREATION');
//       await this.sendOwnable(sender, content);
//       this.queueService.creatingOwnable(false);
//     });
//   }

//   private async startOwnableCreation(
//     rid: string,
//     jsonFile: any,
//     nftInfo: NftInfo,
//     sender: string,
//     verbose: boolean,
//   ) {
//     // Update Redis status
//     await this.redisService.updateStatus(rid, 'ownable_creation_started');

//     if (verbose)
//       console.log(
//         `Creating directory for template at: ${this.pathToRids}/${rid}/${rid}_template`,
//       );
//     mkdirSync(`${this.pathToRids}/${rid}/${rid}_template`, { recursive: true });

//     if (verbose) console.log('Copying template for modification');
//     cpSync(
//       `${this.pathToTemplates}/template1`,
//       `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`,
//       { recursive: true },
//     );

//     this.copyAssets(rid, jsonFile, verbose);

//     // Replace placeholders
//     await this.replacePlaceholders(rid, jsonFile, verbose);

//     if (verbose)
//       console.log(
//         'Copying modified template into ownables directory for creation',
//       );
//     cpSync(
//       `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`,
//       `ownables/${jsonFile.PLACEHOLDER1_NAME}`,
//       { recursive: true },
//     );

//     // Check for dependencies
//     await this.verifyDependencies(verbose);

//     // Build Ownable
//     if (verbose) console.log('Building Ownable...');
//     await this.executeCommand(
//       `npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`,
//     );
//     if (verbose)
//       console.log(
//         `Starting file watcher for: ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`,
//       );

//     // Start file watcher and update Redis on completion
//     await this.watchFileCreation(
//       `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`,
//       jsonFile,
//       nftInfo,
//       sender,
//       rid,
//       verbose,
//     );
//     await this.redisService.updateStatus(rid, 'waiting_for_zip_creation');
//   }

//   // Helper to copy image and thumbnail
//   private copyAssets(rid: string, jsonFile: any, verbose: boolean) {
//     if (verbose) console.log('Copying image file into template');
//     cpSync(
//       `${this.pathToRids}/${rid}/${rid}/${jsonFile.PLACEHOLDER2_IMG}`,
//       `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`,
//     );

//     if (verbose) console.log('Copying thumbnail image file into template');
//     cpSync(
//       `${this.pathToRids}/${rid}/${rid}/${jsonFile.OWNABLE_THUMBNAIL}`,
//       `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`,
//     );
//   }

//   // Helper to replace placeholders
//   private async replacePlaceholders(
//     rid: string,
//     jsonFile: any,
//     verbose: boolean,
//   ) {
//     const placeholders = [
//       {
//         file: 'Cargo.toml',
//         key: 'PLACEHOLDER1_NAME',
//         value: jsonFile.PLACEHOLDER1_NAME,
//       },
//       {
//         file: 'Cargo.toml',
//         key: 'PLACEHOLDER1_DESCRIPTION',
//         value: jsonFile.PLACEHOLDER1_DESCRIPTION,
//       },
//       {
//         file: 'Cargo.toml',
//         key: 'PLACEHOLDER1_VERSION',
//         value: jsonFile.PLACEHOLDER1_VERSION,
//       },
//       {
//         file: 'Cargo.toml',
//         key: 'PLACEHOLDER1_AUTHORS',
//         value: jsonFile.PLACEHOLDER1_AUTHORS || '',
//       },
//       {
//         file: 'Cargo.toml',
//         key: 'PLACEHOLDER1_KEYWORDS',
//         value: arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS),
//       },
//       {
//         file: 'assets/index.html',
//         key: 'PLACEHOLDER2_TITLE',
//         value: jsonFile.PLACEHOLDER2_TITLE,
//       },
//       {
//         file: 'assets/index.html',
//         key: 'PLACEHOLDER2_IMG',
//         value: jsonFile.PLACEHOLDER2_IMG,
//       },
//       {
//         file: 'examples/schema.rs',
//         key: 'PLACEHOLDER3_MSG',
//         value: jsonFile.PLACEHOLDER1_NAME,
//       },
//       {
//         file: 'examples/schema.rs',
//         key: 'PLACEHOLDER3_STATE',
//         value: jsonFile.PLACEHOLDER1_NAME,
//       },
//       {
//         file: 'src/contract.rs',
//         key: 'PLACEHOLDER4_CONTRACT_NAME',
//         value: `crates.io:${jsonFile.PLACEHOLDER1_NAME}`,
//       },
//       {
//         file: 'src/contract.rs',
//         key: 'PLACEHOLDER4_TYPE',
//         value: jsonFile.PLACEHOLDER4_TYPE,
//       },
//       {
//         file: 'src/contract.rs',
//         key: 'PLACEHOLDER4_DESCRIPTION',
//         value: jsonFile.PLACEHOLDER4_DESCRIPTION,
//       },
//       {
//         file: 'src/contract.rs',
//         key: 'PLACEHOLDER4_NAME',
//         value: jsonFile.PLACEHOLDER4_NAME,
//       },
//     ];

//     for (const { file, key, value } of placeholders) {
//       const filePath = `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/${file}`;
//       await this.replaceLineInFile(filePath, key, value.toString());
//       if (verbose) console.log(`Replaced ${key} in ${filePath}`);
//     }
//   }

//   // Dependency verification function
//   private async verifyDependencies(verbose: boolean) {
//     const commands = [
//       'cargo --version',
//       'rustup --version',
//       'wasm-pack --version',
//     ];
//     for (const command of commands) {
//       try {
//         const output = await this.executeCommand(command);
//         if (verbose) console.log(`${command} output:`, output);
//       } catch (error) {
//         console.error(`${command} is required but failed to run:`, error);
//         throw error;
//       }
//     }
//   }
//   // private async startOwnableCreation(
//   //   rid: string,
//   //   jsonFile: any,
//   //   nftInfo: NftInfo,
//   //   sender: string,
//   //   verbose: boolean,
//   // ) {
//   //   if (verbose)
//   //     console.log(
//   //       'creating directory for template',
//   //       `${this.pathToRids}/${rid}/${rid}_template`,
//   //     );
//   //   mkdirSync(`${this.pathToRids}/${rid}/${rid}_template`, { recursive: true });

//   //   if (verbose)
//   //     console.log('copying template 1 to template directory for modification');
//   //   cpSync(
//   //     `${this.pathToTemplates}/template1`,
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`,
//   //     { recursive: true },
//   //   );
//   //   if (verbose) console.log('copying image file into template');
//   //   cpSync(
//   //     `${this.pathToRids}/${rid}/${rid}/${jsonFile.PLACEHOLDER2_IMG}`,
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`,
//   //   );
//   //   if (verbose) console.log('copying thumbnail image file into template');
//   //   cpSync(
//   //     `${this.pathToRids}/${rid}/${rid}/${jsonFile.OWNABLE_THUMBNAIL}`,
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`,
//   //   );

//   //   if (verbose)
//   //     console.log(
//   //       'Replacing Placeholder texts of template with user input data',
//   //     );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(),
//   //     'PLACEHOLDER1_NAME'.toString(),
//   //     `"${jsonFile.PLACEHOLDER1_NAME}"`.toString(),
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(),
//   //     'PLACEHOLDER1_DESCRIPTION'.toString(),
//   //     `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`.toString(),
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(),
//   //     'PLACEHOLDER1_VERSION'.toString(),
//   //     `"${jsonFile.PLACEHOLDER1_VERSION}"`.toString(),
//   //   );

//   //   if (typeof jsonFile.PLACEHOLDER1_AUTHORS === 'undefined')
//   //     jsonFile.PLACEHOLDER1_AUTHORS = '';
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(),
//   //     'PLACEHOLDER1_AUTHORS'.toString(),
//   //     `"${jsonFile.PLACEHOLDER1_AUTHORS}"`.toString(),
//   //   );

//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(),
//   //     'PLACEHOLDER1_KEYWORDS'.toString(),
//   //     arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS),
//   //   );

//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(),
//   //     'PLACEHOLDER2_TITLE'.toString(),
//   //     `${jsonFile.PLACEHOLDER2_TITLE}`,
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(),
//   //     'PLACEHOLDER2_IMG'.toString(),
//   //     `"${jsonFile.PLACEHOLDER2_IMG}"`.toString(),
//   //   );

//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(),
//   //     'PLACEHOLDER3_MSG'.toString(),
//   //     `${jsonFile.PLACEHOLDER1_NAME}`,
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(),
//   //     'PLACEHOLDER3_STATE'.toString(),
//   //     `${jsonFile.PLACEHOLDER1_NAME}`,
//   //   );

//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(),
//   //     'PLACEHOLDER4_CONTRACT_NAME'.toString(),
//   //     `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`.toString(),
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(),
//   //     'PLACEHOLDER4_TYPE'.toString(),
//   //     `"${jsonFile.PLACEHOLDER4_TYPE}"`.toString(),
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(),
//   //     'PLACEHOLDER4_DESCRIPTION'.toString(),
//   //     `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`.toString(),
//   //   );
//   //   await this.replaceLineInFile(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(),
//   //     'PLACEHOLDER4_NAME'.toString(),
//   //     `"${jsonFile.PLACEHOLDER4_NAME}"`.toString(),
//   //   );
//   //   if (verbose)
//   //     console.log(
//   //       'copying modified template into ownables for ownable creation based on user inputs',
//   //       `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`,
//   //     );
//   //   cpSync(
//   //     `${this.pathToRids}/${rid}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`,
//   //     `ownables/${jsonFile.PLACEHOLDER1_NAME}`,
//   //     { recursive: true },
//   //   );

//   //   if (verbose)
//   //     console.log('Checking Cargo, Wasm-Pack and Rustup existance...');
//   //   try {
//   //     const output = await this.executeCommand('cargo --version');
//   //     console.log(output);
//   //   } catch (error) {
//   //     console.error(
//   //       'Cargo command failed, but essential for Ownable creation:',
//   //       error,
//   //     );
//   //     throw error;
//   //   }
//   //   try {
//   //     const output = await this.executeCommand('rustup --version');
//   //     console.log(output);
//   //   } catch (error) {
//   //     console.error(
//   //       'Rustup command failed, but essential for Ownable creation:',
//   //       error,
//   //     );
//   //     throw error;
//   //   }
//   //   try {
//   //     const output = await this.executeCommand('wasm-pack --version');
//   //     console.log(output);
//   //   } catch (error) {
//   //     console.error(
//   //       'Wasm-Pack command failed, but essential for Ownable creation:',
//   //       error,
//   //     );
//   //     throw error;
//   //   }

//   //   if (verbose) console.log('Building Ownable...');
//   //   await this.executeCommand(
//   //     `npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`,
//   //   );
//   //   if (verbose)
//   //     console.log(
//   //       'Starting file watcher for zip file:',
//   //       `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`,
//   //     );
//   //   await this.watchFileCreation(
//   //     `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`,
//   //     jsonFile,
//   //     nftInfo,
//   //     sender,
//   //     rid,
//   //     verbose,
//   //   );

//   //   if (verbose)
//   //     console.log(
//   //       'Ownable creation startet. Waiting for Zip File to be created...',
//   //     );
//   // }

//   private async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
//     let archive: JSZip;
//     var zip = new JSZip();
//     if (typeof data === 'string') {
//       archive = await zip.loadAsync(readFileSync(data), {
//         createFolders: true,
//       });
//     } else {
//       archive = await zip.loadAsync(data, { createFolders: true });
//     }

//     const entries: Array<[string, Buffer]> = await Promise.all(
//       Object.entries(archive.files)
//         // .filter(([filename]) => filename !== 'chain.json')
//         .map(async ([filename, file]) => [
//           filename,
//           await file.async('nodebuffer'),
//         ]),
//     );

//     return new Map(entries);
//   }

//   private async getUniqueId(files: Map<string, Buffer>): Promise<string> {
//     const source = Array.from(files.entries()).map(([filename, content]) => ({
//       path: `./${filename}`,
//       content,
//     }));

//     for await (const entry of this.ipfs.addAll(source, {
//       onlyHash: true,
//       cidVersion: 1,
//     })) {
//       //if (entry.path === entry.cid.toString() && !!entry.mode) return entry.cid.toString();
//       if (entry.path === entry.cid.toString()) {
//         return entry.cid.toString();
//       }
//     }
//     throw new Error(
//       'Failed to calculate directory CID: importer did not find a directory entry in the input files',
//     );
//   }

//   // private async storeZip(
//   //   destPath: string,
//   //   uniqueId: string,
//   //   data: Uint8Array,
//   // ): Promise<void> {
//   //   const file = path.join(destPath, `${uniqueId}.zip`);
//   //   writeFileSync(file, data);
//   // }

//   // async claim(requestId: string, signer?: Account): Promise<StreamableFile> {
//   //   console.log("HTTP Authentication SIGNER: ", signer);
//   //   if (typeof signer !== 'undefined') {
//   //     console.log("HTTP Authentication SIGNER LTO ADDRESS: ", signer.address);
//   //   }
//   //   const claimableZipFile = `${this.pathToRids}/${requestId}/${requestId}_claim.zip`;
//   //   if (!(await fileExists(claimableZipFile))) {
//   //     throw (`Request ID ${requestId} does not have a claimable Ownable`);
//   //   }
//   //   let user: string;
//   //   try {
//   //     const files = readdirSync(`${this.pathToRids}/${requestId}/`);
//   //     files.forEach(file => {
//   //       if (file.match(/_USER$/g)) {
//   //         user = file.replace("_USER", "");
//   //       }
//   //     })
//   //   } catch (e) {
//   //     throw (e);
//   //   }

//   //   const claimableFileInfo = `${this.pathToUserRids}/${user}/${requestId}_claimable`;
//   //   const claimableInfo = JSON.parse(readFileSync(claimableFileInfo).toString());
//   //   claimableInfo.CLAIMED = true;

//   //   writeFileSync(claimableFileInfo, JSON.stringify(claimableInfo));

//   //   const file = createReadStream(claimableZipFile);
//   //   return new StreamableFile(file);

//   // }

//   // async zipped(cid: string): Promise<JSZip> {
//   //   const zip = new JSZip();
//   //   const data = readFileSync(`${this.pathToCids}/${cid}.zip`, 'utf8');
//   //   return await zip.loadAsync(data, { createFolders: true });
//   // }

//   private async storeFiles(
//     destPath: string,
//     cid: string,
//     files: Map<string, Buffer>,
//   ): Promise<void> {
//     const packageDir = path.join(destPath, cid);
//     mkdirSync(packageDir, { recursive: true });

//     await Promise.all(
//       Array.from(files.entries()).map(([filename, content]) =>
//         writeFileSync(path.join(packageDir, filename), content),
//       ),
//     );
//   }
//   // uploadFile(file: Express.Multer.File) {
//   //   return file;
//   // }
//   // create(createUploadZipDto: CreateUploadZipDto) {
//   //   return 'This action adds a new uploadZip';
//   // }

//   // findAll() {
//   //   return `This action returns all uploadZip`;
//   // }

//   // findOne(id: number) {
//   //   return `This action returns a #${id} uploadZip`;
//   // }

//   // update(id: number, updateUploadZipDto: UpdateUploadZipDto) {
//   //   return `This action updates a #${id} uploadZip`;
//   // }

//   // remove(id: number) {
//   //   return `This action removes a #${id} uploadZip`;
//   // }
// }

import {
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '../common/config/config.service';
import { RedisService } from '../common/redis/redis.service';
import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';
import { FileService } from './file.service';
import { BuildService } from './build.service';
import { NftService } from './nft.service';
import { HttpService } from '@nestjs/axios';
import { LTO, Account, Message, Relay } from '@ltonetwork/lto';

@Injectable()
export class UploadZipService implements OnModuleInit, OnModuleDestroy {
  private lto: LTO;
  private _ltoAccount: Account;
  private packageInfo: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly fileService: FileService,
    private readonly buildService: BuildService,
    private readonly nftService: NftService,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    this.packageInfo = require('../../package.json');
    this.lto = new LTO(this.configService.get('lto.networkId'));
    this._ltoAccount = this.lto.account({
      seed: this.configService.get('lto.account.seed'),
    });

    // Initial queue setup
    this.rabbitMQService.consumeQueue(
      'fileOperationsQueue',
      this.processFileOperations.bind(this),
    );
    this.rabbitMQService.consumeQueue(
      'buildQueue',
      this.processBuildQueue.bind(this),
    );
    this.rabbitMQService.consumeQueue(
      'nftQueue',
      this.processNftQueue.bind(this),
    );
  }

  async onModuleDestroy() {
    await this.rabbitMQService.closeConnection();
  }

  async processRequest(
    requestId: string,
    data: Uint8Array,
    walletAddress: string,
  ) {
    await this.redisService.set(requestId, {
      requestId,
      status: 'processing',
      date: new Date().toISOString(),
      walletAddress,
    });
    await this.rabbitMQService.publishToQueue('fileOperationsQueue', {
      requestId,
      data: Array.from(data),
    });
  }

  private async processFileOperations(msg: any) {
    const { requestId, data } = msg;

    await this.redisService.updateStatus(requestId, 'unzipping');
    const unzippedFiles = await this.fileService.unzip(Uint8Array.from(data));

    if (!unzippedFiles.has('ownableData.json')) {
      await this.redisService.updateStatus(
        requestId,
        'error: ownableData.json missing',
      );
      throw new Error("Invalid package: 'ownableData.json' is missing");
    }

    await this.redisService.updateStatus(requestId, 'metadata_stored');
    const metadata =
      await this.fileService.readOwnableDataFromZip(unzippedFiles);
    await this.redisService.set(`${requestId}:metadata`, metadata);

    await this.rabbitMQService.publishToQueue('buildQueue', {
      requestId,
      metadata,
      unzippedFiles,
    });
  }

  private async processBuildQueue(msg: any) {
    const { requestId, metadata, unzippedFiles } = msg;

    await this.redisService.updateStatus(requestId, 'building');
    const transactionIdData = await this.verifyTransaction(
      metadata.OWNABLE_LTO_TRANSACTION_ID,
      requestId,
    );

    await this.redisService.set(
      `${requestId}:transactionData`,
      transactionIdData,
    );
    await this.redisService.updateStatus(requestId, 'transaction_validated');

    // Set up build path and pass requestId instead of path to `createOwnable`
    await this.buildService.createOwnable(
      requestId,
      metadata,
      transactionIdData,
    );

    await this.redisService.updateStatus(requestId, 'build_complete');
    await this.rabbitMQService.publishToQueue('nftQueue', {
      requestId,
      metadata,
      transactionIdData,
    });
  }

  private async processNftQueue(msg: any) {
    const { requestId, metadata, transactionIdData } = msg;

    await this.redisService.updateStatus(requestId, 'nft_processing');
    const nftInfo = await this.nftService.handleNftCreation(metadata);

    await this.redisService.set(`${requestId}:nftInfo`, nftInfo);
    await this.redisService.updateStatus(requestId, 'nft_complete');

    await this.finalizeOwnable(
      requestId,
      metadata,
      nftInfo,
      transactionIdData.sender,
    );
  }

  private async verifyTransaction(txId: string, requestId: string) {
    const url = `${this.configService.get('lto.node')}/transactions/info/${txId}`;
    const data = await this.httpService.axiosRef
      .get(url)
      .then((res) => res.data)
      .catch((err) => {
        throw new Error(`Transaction validation error: ${err.message}`);
      });

    await this.checkReuseOfTxId(txId, requestId);
    return {
      type: data.type,
      sender: data.sender,
      recipient: data.recipient,
      amount: data.amount,
    };
  }

  private async checkReuseOfTxId(ltoTransactionId: string, requestId: string) {
    const existingTxId = await this.redisService.get(
      `txid:${ltoTransactionId}`,
    );
    if (existingTxId) {
      throw new Error(`LTO transaction ID ${ltoTransactionId} already used.`);
    }
    await this.redisService.set(`txid:${ltoTransactionId}`, requestId);
  }

  private async finalizeOwnable(
    requestId: string,
    metadata: any,
    nftInfo: any,
    sender: string,
  ) {
    await this.redisService.updateStatus(requestId, 'ownable_finalization');
    await this.buildService.completeOwnableCreation(
      requestId,
      metadata,
      nftInfo,
      sender,
    );
    await this.redisService.updateStatus(requestId, 'completed');
  }
}
