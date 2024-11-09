import { Injectable, OnModuleInit } from '@nestjs/common';
// import { ConfigService } from '../common/config/config.service';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './TelegramBot.service';
// import { ConfigService } from '@nestjs/config';
import { S3, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import S3Bucket from 'any-bucket/s3';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { QueueError } from '../interfaces/error';
import { NftInfo } from 'src/interfaces/OwnableInfo';
import { format } from 'date-fns';

@Injectable()
export class QueueService implements OnModuleInit {
  private queue: QueueEntry[] = [];
  private queueData: Uint8Array[] = [];
  private isQueueing: boolean;
  private templateCosts: any = {};
  private s3Client: S3;
  private s3Bucket: S3Bucket;

  constructor(
    private readonly config: ConfigService,
    private readonly telegramService: TelegramService
  ) {
    this.isQueueing = true;
    const s3LocalConfig = {
      endpoint: 'http://localhost:4566', // LocalStack endpoint
      forcePathStyle: true, // Required for local testing
      credentials: {
        accessKeyId: 'TESTKEY', // Dummy key
        secretAccessKey: 'TESTSECRET' // Dummy secret
      },
      region: 'eu-west-1'
    };
    // const localTesting = config.get('bucket.localTesting');
    const localTesting = config.get('LOCAL_TESTING');
    if (localTesting) {
      console.log("Local testing:", localTesting);
      this.s3Client = new S3(s3LocalConfig); // FOR TESTING ONLY

    } else {
      this.s3Client = new S3({ region: 'eu-west-1' });

    }
    this.s3Bucket = new S3Bucket(this.s3Client, this.config.get('OWNABLE_BUCKET'));
    // this.s3Bucket = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.queue'));        
  }


  async onModuleInit() {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.config.get('OWNABLE_BUCKET') }));
      console.log(`Bucket already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        console.log(`Bucket does not exist. Creating it now.`);
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.config.get('OWNABLE_BUCKET') }));
        await this.updateQueueInS3Bucket();
      } else {
        console.error('Error checking bucket existence:', err);
        return; // Exit early if there's a non-not-found error
      }

    }
    try {
      // Now try to retrieve the Queue.json file
      const queueMainFileBuffer = await this.s3Bucket.get('Queue.json');
      const queueMainFileJsonString = queueMainFileBuffer.toString('utf-8');
      const queueMainFileJsonData = JSON.parse(queueMainFileJsonString);
      await this.initializeQueueWithS3Data(queueMainFileJsonData);
    } catch (err) {
      console.error("Error initializing Queue with S3 data:", err);
      await this.updateQueueInS3Bucket();
    }

    try {
      // Now try to retrieve the TemplateCosts file
      const templateCostsBuffer = await this.s3Bucket.get('TemplateCosts.json');
      const templateCostsJsonString = templateCostsBuffer.toString('utf-8');
      const templateCostsJsonData = JSON.parse(templateCostsJsonString);
      await this.initializeTemplateCostsS3Data(templateCostsJsonData);
    } catch (err) {
      console.error("TemplateCosts.json file not found. Creating one...");
      this.templateCosts = {
        "noNFT": {
          "1": "5000000"
        },
        "ethereum": {
          "1": "20000000"
        },
        "arbitrum": {
          "1": "10000000"
        },
      };
      await this.updateTemplateCostsInS3Bucket();
    }

  }
  private async updateTemplateCostsInS3Bucket() {
    try {
      await this.s3Bucket.put(`TemplateCosts.json`, JSON.stringify(this.templateCosts));
    } catch (err) {
      throw new QueueError(`Failed to initiate TemplateCosts.json on s3Bucket`);
    }
  }
  private async updateQueueInS3Bucket() {
    try {
      await this.s3Bucket.put(`Queue.json`, JSON.stringify(this.queue));
    } catch (err) {
      throw new QueueError(`Failed to initiate Queue.json on s3Bucket`);
    }
  }
  private async initializeTemplateCostsS3Data(templateCostsS3Bucket: any) {
    this.templateCosts = templateCostsS3Bucket;
    // console.log("templateCosts", this.templateCosts)
  }

  public getTemplateCosts(network: string, templateId: string): string {
    return this.templateCosts[network][templateId].toString();

  }

  private async initializeQueueWithS3Data(queueS3Bucket: any) {
    for (const entry of queueS3Bucket) {
      // Push the entry into the queue
      this.queue.push({
        data: entry.data,
        rid: entry.rid,
        ltoWallet: entry.ltoWallet,
        hash: entry.hash,
        txId: entry.txId,
        ownableStatus: entry.ownableStatus,
        templateId: entry.templateId,
        timestampInQueue: entry.timestampInQueue,
        timestampProcessing: entry.timestampProcessing,
        timestampReady: entry.timestampReady,
        timestampSent: entry.timestampSent,
        timestampFailed: entry.timestampFailed,
        failedErrMsg: entry.failedErrMsg,
        cid: entry.cid ?? '',
        nftInfo: {
          network: '',
          address: '',
          id: 0
        }
        // nftNetwork: entry.nftInfo.network,
        // nftAddress: entry.nftInfo.address,
        // nftId: entry.nftInfo.id
      });

      // Check if the status is not Unknown before fetching data
      if (entry.ownableStatus !== OwnableStatus.Unknown) {
        try {
          const dataUint8Array = await this.s3Bucket.get(entry.data);
          this.queueData.push(dataUint8Array);
        } catch (err) {
          throw new QueueError(`Failed to get ${entry.data} from s3Bucket`);
        }
      } else {
        // If status is Unknown, push an empty Uint8Array
        this.queueData.push(new Uint8Array([]));
      }
    }

  }
  // For `getNextQueueEntry`
  private getNextQueueEntry(): [QueueEntry, number] | [null, null] {
    const entry = this.queue.find((entry: QueueEntry) => entry.ownableStatus === OwnableStatus.InQueue);
    return entry ? [entry, this.queue.indexOf(entry)] : [null, null];
  }

  // For `getProcessingQueueEntryIndex`
  private getQueueEntryIndexByStatus(status: OwnableStatus): number | null {
    const index = this.queue.findIndex((entry: QueueEntry) => entry.ownableStatus === status);
    return index >= 0 ? index : null;
  }

  public getRequestIdByTxId(txId: string): string | null {
    const entry = this.queue.find((entry: QueueEntry) => entry.txId === txId);
    return entry ? entry.rid : null;
  }



  // Enqueue a new Uint8Array to the queue
  public async enqueue(requestId: string, data: Uint8Array, ltoWallet: string, txId: string, templateId: number): Promise<QueueEntry> {
    if (data instanceof Uint8Array) {
      const newQueueEntry: QueueEntry = {
        data: `${requestId}_data`,
        rid: `${requestId}`,
        ltoWallet: ltoWallet,
        hash: '',
        txId: txId,
        ownableStatus: OwnableStatus.InQueue,
        templateId: templateId,
        timestampInQueue: Math.floor(Date.now() / 1000),
        timestampProcessing: 0,
        timestampReady: 0,
        timestampSent: 0,
        timestampFailed: 0,
        failedErrMsg:'',
        cid: '',
        nftInfo: {
          network: '',
          address: '',
          id: 0
        }
      }
      try {
        await this.s3Bucket.put(`${requestId}_data`, data);
      } catch (err) {
        throw new Error(`Putting ${requestId}_data into s3 Bucket failed. Error: ${err}`);
      }
      const timestamp = Math.floor(Date.now());
      const formattedDate = format(timestamp, 'yyyy-MM-dd HH:mm');
      try {
        await this.telegramService.sendMessageToTelegramBot(`QUEUE-InQueue:(${formattedDate})\nrequestId: ${requestId}\ntxID: ${txId}\nltoWallet: ${ltoWallet}`);
      } catch (err) {
        throw new Error(`Telegram Service Error.  ${err}`);
      }
      this.queue.push(newQueueEntry);
      this.queueData.push(data);
      try {
        await this.updateQueueInS3Bucket();
      } catch (err) {
        this.queue.pop();
        this.queueData.pop();
        throw new Error(`Updating Queue in s3 bucket failed. Error: ${err}`);
      }
      return newQueueEntry;
      // this.queueRequestId.push(requestId);
    } else {
      throw new Error('Data must be of type Uint8Array');
    }
  }

  public getQueueEntryByRequestId(requestId: string): [QueueEntry, number] {
    const defaultQueueEntry = {
      data: '',
      rid: '',
      ltoWallet: '',
      hash: '',
      txId: '',
      ownableStatus: OwnableStatus.Unknown,
      templateId: 0,
      timestampInQueue: 0,
      timestampProcessing: 0,
      timestampReady: 0,
      timestampSent: 0,
      timestampFailed: 0,
      failedErrMsg:'',
      cid: '',
      nftInfo: {
        network: '',
        address: '',
        id: 0
      }
    };

    const entry = this.queue.find((entry: QueueEntry) => entry.rid === requestId);
    return entry ? [entry, this.queue.indexOf(entry)] : [defaultQueueEntry, 0];
  }


  public getQueueEntriesByWallet(ltoWallet: string): QueueEntry[] {
    const queryQueueEntries: QueueEntry[] = [];
    this.queue.forEach((entry: QueueEntry) => {
      if (entry.ltoWallet === ltoWallet) {
        queryQueueEntries.push(entry);
      }
    });
    return queryQueueEntries;
  }

  public getQueueEntriesByStatus(status: OwnableStatus): QueueEntry[] {
    const queryQueueEntries: QueueEntry[] = [];
    this.queue.forEach((entry: QueueEntry) => {

      if (entry.ownableStatus.toString() === status.toString()) {
        queryQueueEntries.push(entry);
      }
    });
    return queryQueueEntries;
  }

  public async setCidNftInfo(requestId: string, cid: string, nftInfo: NftInfo) {
    const [entry, index] = this.getQueueEntryByRequestId(requestId);
    this.queue[index].cid = cid;
    // this.queue[index].nftNetwork = nftInfo.network;
    // this.queue[index].nftAddress = nftInfo.address;
    // this.queue[index].nftId = nftInfo.id;
    this.queue[index].nftInfo = nftInfo;
    try {
    await this.updateQueueInS3Bucket();
  }catch(err) {
    throw err;
  }
  }

  public async ownableFailed(requestId: string,errMsg:string) {
    const [entry, index] = this.getQueueEntryByRequestId(requestId);
    if (index >= 0 && index < this.queue.length) {
      this.queue[index].timestampFailed=Math.floor(Date.now() / 1000);
      this.queue[index].failedErrMsg=errMsg;
      this.queue[index].ownableStatus = OwnableStatus.Failed;
    } else {
      console.log(`Index ${index} is out of bounds.`);
    } 
    await this.s3Bucket.put(`Queue.json`, JSON.stringify(this.queue));
    const timestamp = Math.floor(Date.now());
      const formattedDate = format(timestamp, 'yyyy-MM-dd HH:mm');
      try {
        await this.telegramService.sendMessageToTelegramBot(`QUEUE-InQueue:(${formattedDate})\nrequestId: ${requestId}\ntxID: ${this.queue[index].txId}\nltoWallet: ${this.queue[index].ltoWallet}\nerrMsg: ${this.queue[index].failedErrMsg}`);
      } catch (err) {
        throw new Error(`Telegram Service Error.  ${err}`);
      }
  }
  // public async setTxId(requestId: string, txId: string) {
  //   const [entry, index] = this.getQueueEntryByRequestId(requestId);
  //   this.queue[index].txId = txId;
  //   try {
  //     await this.updateQueueInS3Bucket();
  //   }catch(err) {
  //     throw err;
  //   }
  // }



  public async deleteOwnableData(requestId: string) {
    const [entry, index] = this.getQueueEntryByRequestId(requestId);
    if (index >= 0 && index < this.queue.length) {

      await this.s3Bucket.delete(this.queue[index].data);

      this.queue.splice(index, 1);
      console.log(`Entry at index ${index} deleted successfully.`);
    } else {
      console.log(`Index ${index} is out of bounds.`);
    }
    await this.s3Bucket.put(`Queue.json`, JSON.stringify(this.queue));
  }

  public async setQueueEntryStatus(requestId: string, status: OwnableStatus, hash?: string) {
    const [entry, index] = this.getQueueEntryByRequestId(requestId);

    if (status == OwnableStatus.Processing) {
      this.queue[index].timestampProcessing = Math.floor(Date.now() / 1000);

    } else if (status == OwnableStatus.Ready) {
      this.queue[index].timestampReady = Math.floor(Date.now() / 1000);
      // const formattedDate = (this.queue[index].timestampReady * 1000).toLocaleString();
      const formattedDate = format(this.queue[index].timestampReady * 1000, 'yyyy-MM-dd HH:mm');
      await this.telegramService.sendMessageToTelegramBot(`QUEUE-Ready:(${formattedDate})\nrequestId: ${this.queue[index].rid}\ntxID: ${this.queue[index].txId}\nltoWallet: ${this.queue[index].ltoWallet}`);

    } else if (status == OwnableStatus.Sent && typeof hash !== 'undefined') {
      this.queue[index].hash = hash;
      this.queue[index].timestampSent = Math.floor(Date.now() / 1000);
      const formattedDate = format(this.queue[index].timestampReady * 1000, 'yyyy-MM-dd HH:mm');
      // const formattedDate = (this.queue[index].timestampSent * 1000).toLocaleString();
      await this.telegramService.sendMessageToTelegramBot(`QUEUE-Sent: (${formattedDate})\nrequestId: ${this.queue[index].rid}\ntxID: ${this.queue[index].txId}\nltoWallet: ${this.queue[index].ltoWallet}`);

    } else if (status == OwnableStatus.InQueue) {
      this.queue[index].timestampInQueue = Math.floor(Date.now() / 1000);
      this.queue[index].timestampProcessing = 0;
      this.queue[index].timestampReady = 0;

    } else if (status == OwnableStatus.Failed) {
      this.queue[index].timestampFailed = Math.floor(Date.now() / 1000);

    } else {
      throw new Error(`Unknown Ownable status ${status} for requestId ${requestId}`);
    }
    this.queue[index].ownableStatus = status;
    await this.updateQueueInS3Bucket();
  }

  public async processNextQueueEntry(): Promise<[string, Uint8Array, string] | [null, null, null]> {
    const [entry, index] = this.getNextQueueEntry();
    if (index != null) {
      let data: Uint8Array = new Uint8Array([]);

      data = this.queueData[index];
      this.queue[index].ownableStatus = OwnableStatus.Processing;
      this.queue[index].timestampProcessing = Math.floor(Date.now() / 1000);
      const formattedDate = format(this.queue[index].timestampProcessing * 1000, 'yyyy-MM-dd HH:mm');
      await this.telegramService.sendMessageToTelegramBot(`QUEUE-Processing: (${formattedDate})\nrequestId: ${this.queue[index].rid}\ntxID: ${this.queue[index].txId}\nltoWallet: ${this.queue[index].ltoWallet}`);
      await this.updateQueueInS3Bucket();
      return [entry.rid, data, entry.ltoWallet];
    } else {
      // console.log('Queue is empty');
      return [null, null, null];
    }
  }

  public isCreatingOwnable(): boolean {
    const index = this.getQueueEntryIndexByStatus(OwnableStatus.Processing);
    if (index != null) {
      return true;
    }
    return false;
  }

  public isQueueEmpty(): boolean {
    const index = this.getQueueEntryIndexByStatus(OwnableStatus.InQueue);
    if (index != null) {
      return false;
    }
    return true;
  }

  public allowQueueing(status: boolean): void {
    this.isQueueing = status;
  }

  public isQueueingAllowed(): boolean {
    return this.isQueueing;
  }
}