import { Injectable, OnModuleInit } from '@nestjs/common';
// import { ConfigService } from '../common/config/config.service';
import { ConfigService } from '@nestjs/config';
// import { ConfigService } from '@nestjs/config';
import { S3, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import S3Bucket from 'any-bucket/s3';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { QueueError } from '../interfaces/error';

@Injectable()
export class QueueService implements OnModuleInit {
  private queue: QueueEntry[] = [];
  private queueData: Uint8Array[] = [];
  private isQueueing: boolean;
  private s3Client: S3;
  private s3Bucket: S3Bucket;

  constructor(private readonly config: ConfigService) {
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
    // this.s3Client = new S3(s3LocalConfig); // FOR TESTING ONLY
    this.s3Client = new S3({ region: 'eu-west-1' });
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
    // Now try to retrieve the Queue.json file
    let queueMainFileBuffer: any;
    try {
      queueMainFileBuffer = await this.s3Bucket.get('Queue.json');
      const queueMainFileJsonString = queueMainFileBuffer.toString('utf-8');
      const queueMainFileJsonData = JSON.parse(queueMainFileJsonString);
      await this.initializeQueueWithS3Data(queueMainFileJsonData);
    } catch (err) {
      console.error("Error initializing Queue with S3 data:", err);
    }

  }

  private async updateQueueInS3Bucket() {
    try {
      await this.s3Bucket.put(`Queue.json`, JSON.stringify(this.queue));
    } catch (err) {
      throw new QueueError(`Failed to initiate Queue.json on s3Bucket`);
    }
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
        timestampSent: entry.timestampSent
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
  private getProcessingQueueEntryIndex(): number | null {
    const index = this.queue.findIndex((entry: QueueEntry) => entry.ownableStatus === OwnableStatus.Processing);
    return index >= 0 ? index : null;
  }
  private getInQueueEntryIndex(): number | null {
    const index = this.queue.findIndex((entry: QueueEntry) => entry.ownableStatus === OwnableStatus.InQueue);
    return index >= 0 ? index : null;
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
        timestampSent: 0
      }
      this.queue.push(newQueueEntry);
      this.queueData.push(data);
      try {
        await this.updateQueueInS3Bucket();
      } catch (err) {
        throw new Error(`Updating Queue in s3 bucket failed. Error: ${err}`);
      }
      try {
        await this.s3Bucket.put(`${requestId}_data`, data);
      } catch (err) {
        throw new Error(`Putting ${requestId}_data into s3 Bucket failed. Error: ${err}`);
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
      timestampSent: 0
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

  public async setTxId(requestId: string, txId: string) {
    const [entry, index] = this.getQueueEntryByRequestId(requestId);
    this.queue[index].txId = txId;
    await this.updateQueueInS3Bucket();
  }

  public getRequestIdByTxId(txId: string): string | null {
    const entry = this.queue.find((entry: QueueEntry) => entry.txId === txId);
    return entry ? entry.rid : null;
  }

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
    } else if (status == OwnableStatus.Sent && typeof hash !== 'undefined') {
      this.queue[index].hash = hash;
      this.queue[index].timestampSent = Math.floor(Date.now() / 1000);
    } else if (status == OwnableStatus.InQueue) {
      this.queue[index].timestampInQueue = Math.floor(Date.now() / 1000);
      this.queue[index].timestampProcessing = 0;
      this.queue[index].timestampReady = 0;
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

      await this.updateQueueInS3Bucket();
      return [entry.rid, data, entry.ltoWallet];
    } else {
      // console.log('Queue is empty');
      return [null, null, null];
    }
  }

  public isCreatingOwnable(): boolean {
    const index = this.getProcessingQueueEntryIndex();
    if (index != null) {
      return true;
    }
    return false;
  }

  public isQueueEmpty(): boolean {
    const index = this.getInQueueEntryIndex();
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