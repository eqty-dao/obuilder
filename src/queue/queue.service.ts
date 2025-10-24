import { Injectable, OnModuleInit } from '@nestjs/common';

import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { QueueError } from '../interfaces/error';
import { NftInfo } from '../interfaces/OwnableInfo';
import { format } from 'date-fns';
// import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { S3Service } from '../s3/s3.service';
import { LoggingService } from '../logging/redis-logging.service';

@Injectable()
export class QueueService implements OnModuleInit {
  private _queueMainnet = [];
  private _queueDataMainnet = [];
  private _queueTestnet = [];
  private _queueDataTestnet = [];
  private templateCostsMainnet: any = {};
  private templateCostsTestnet: any = {};

  constructor(
    // private readonly config: ConfigService,
    private readonly telegramService: TelegramBotService,
    private readonly s3: S3Service,
    private readonly loggingService: LoggingService,
  ) {
    // this.isQueueingMainnet = true;
    // this.isQueueingTestnet = true;
    // Initialize template costs with default values
    this.templateCostsMainnet = {
      arbitrum: {
        '1': { last: '20000000', prev: '20000000' },
        '2': { last: '20000000', prev: '20000000' },
        '3': { last: '20000000', prev: '20000000' },
      },
    };

    this.templateCostsTestnet = {
      arbitrum: {
        '1': { last: '20000000', prev: '20000000' },
        '2': { last: '20000000', prev: '20000000' },
        '3': { last: '20000000', prev: '20000000' },
      },
    };
  }

  async onModuleInit() {
    //await this.s3.load();
    // await this.updateQueueInS3Bucket('L');
    // await this.updateQueueInS3Bucket('T');

    try {
      // Now try to retrieve the Mainnet Queue.json file
      const existQueueJson_L = await this.s3.checkFileExists('L', 'Queue.json');
      if (existQueueJson_L) {
        const queueMainFileBuffer =
          await this.s3.s3BucketQueue_L.get('Queue.json');
        const queueMainFileJsonString = queueMainFileBuffer.toString('utf-8');
        const queueMainFileJsonData = JSON.parse(queueMainFileJsonString);
        await this.initializeQueueWithS3Data('L', queueMainFileJsonData);
      } else {
        console.log(
          'Queue.json does not exist on Mainnet S3 Bucket. Creating one ...',
        );
        await this.updateQueueInS3Bucket('L');
      }
    } catch (err) {
      console.error('Error initializing Queue with S3 data:', err);
      await this.updateQueueInS3Bucket('L');
    }

    try {
      // Now try to retrieve the Testnet Queue.json file
      const existQueueJson_T = await this.s3.checkFileExists('T', 'Queue.json');
      if (existQueueJson_T) {
        const queueTestFileBuffer =
          await this.s3.s3BucketQueue_T.get('Queue.json');
        const queueTestFileJsonString = queueTestFileBuffer.toString('utf-8');
        const queueTestFileJsonData = JSON.parse(queueTestFileJsonString);
        // console.log("queueTestFileJsonData", queueTestFileJsonData);
        await this.initializeQueueWithS3Data('T', queueTestFileJsonData);
      } else {
        console.log(
          'Queue.json does not exist on Testnet S3 Bucket. Creating one ...',
        );
        await this.updateQueueInS3Bucket('T');
      }
    } catch (err) {
      console.error('Error initializing Queue with S3 data:', err);
      await this.updateQueueInS3Bucket('T');
    }
  }
  // Make getter/setter public to allow UploadZipService to access
  public get queueMainnet() {
    return this._queueMainnet || [];
  }

  public get queueTestnet() {
    return this._queueTestnet || [];
  }

  public async updateQueueInS3Bucket(network_id: string): Promise<void> {
    try {
      console.log(`Updating S3 bucket for network: ${network_id}`);

      // Select the correct queue safely
      const queue =
        network_id === 'L'
          ? this._queueMainnet || []
          : this._queueTestnet || [];
      console.log('updateQueueInS3Bucket: queue', queue);
      // Store with safe JSON conversion
      const jsonData = JSON.stringify(queue);

      if (network_id === 'L') {
        await this.s3.s3BucketQueue_L.put('Queue.json', jsonData);
      } else {
        await this.s3.s3BucketQueue_T.put('Queue.json', jsonData);
      }

      console.log(`Successfully updated queue in S3 for network ${network_id}`);
    } catch (err) {
      console.error(`Failed to update Queue.json on s3Bucket: ${err}`);
      // Don't throw the error - just log it
      console.error(
        `Continuing without S3 update to avoid breaking the workflow`,
      );
    }
  }

  public async setTemplateCosts(
    ltoNetwork_id: 'L' | 'T',
    evmNetwork: string,
    templateId: string,
    lastValue: number,
    prevValue: number,
    usdValue: number,
  ) {
    if (typeof this.templateCostsTestnet[evmNetwork] !== 'object') {
      this.templateCostsTestnet = {
        arbitrum: {
          '1': {
            last: '20000000',
            prev: '20000000',
          },
          '2': {
            last: '20000000',
            prev: '20000000',
          },
          '3': {
            last: '20000000',
            prev: '20000000',
          },
        },
      };
      // await this.updateTemplateCostsInS3Bucket('T');
    }
    if (typeof this.templateCostsMainnet[evmNetwork] !== 'object') {
      this.templateCostsMainnet = {
        arbitrum: {
          '1': {
            last: '20000000',
            prev: '20000000',
          },
          '2': {
            last: '20000000',
            prev: '20000000',
          },
          '3': {
            last: '20000000',
            prev: '20000000',
          },
        },
      };
      // await this.updateTemplateCostsInS3Bucket('L');
    }
    if (ltoNetwork_id === 'L') {
      this.templateCostsMainnet[evmNetwork][templateId]['last'] =
        lastValue.toString();
      if (prevValue > 0) {
        this.templateCostsMainnet[evmNetwork][templateId]['prev'] =
          prevValue.toString();
      } else {
        this.templateCostsMainnet[evmNetwork][templateId]['prev'] =
          lastValue.toString();
      }
    } else if (ltoNetwork_id === 'T') {
      this.templateCostsTestnet[evmNetwork][templateId]['last'] =
        lastValue.toString();
      if (prevValue > 0) {
        this.templateCostsTestnet[evmNetwork][templateId]['prev'] =
          prevValue.toString();
      } else {
        this.templateCostsTestnet[evmNetwork][templateId]['prev'] =
          lastValue.toString();
      }
    }

    // await this.updateTemplateCostsInS3Bucket(ltoNetwork_id);
    await this.telegramService.sendMessageToTelegramBot(
      ltoNetwork_id,
      `Updated template ${templateId} price ${ltoNetwork_id} (${evmNetwork}): from ${prevValue} to ${lastValue} LTO (${usdValue} USD)`,
    );
  }
  public getTemplateCosts(
    ltoNetwork_id: 'L' | 'T',
    evmNetwork: string,
    templateId: string,
  ): string {
    // Initialize template costs if they don't exist
    if (!this.templateCostsMainnet[evmNetwork]) {
      this.templateCostsMainnet[evmNetwork] = {
        '1': { last: '20000000', prev: '20000000' },
        '2': { last: '20000000', prev: '20000000' },
        '3': { last: '20000000', prev: '20000000' },
      };
    }

    if (!this.templateCostsTestnet[evmNetwork]) {
      this.templateCostsTestnet[evmNetwork] = {
        '1': { last: '20000000', prev: '20000000' },
        '2': { last: '20000000', prev: '20000000' },
        '3': { last: '20000000', prev: '20000000' },
      };
    }

    // Ensure the templateId exists
    if (ltoNetwork_id === 'L') {
      if (!this.templateCostsMainnet[evmNetwork][templateId]) {
        this.templateCostsMainnet[evmNetwork][templateId] = {
          last: '20000000',
          prev: '20000000',
        };
      }
      return this.templateCostsMainnet[evmNetwork][templateId].last;
    } else {
      if (!this.templateCostsTestnet[evmNetwork][templateId]) {
        this.templateCostsTestnet[evmNetwork][templateId] = {
          last: '20000000',
          prev: '20000000',
        };
      }
      return this.templateCostsTestnet[evmNetwork][templateId].last;
    }
  }

  public getTemplateCostsIncludingPrevious(
    ltoNetwork_id: 'L' | 'T',
    evmNetwork: string,
    templateId: string,
  ): [string, string] {
    if (ltoNetwork_id === 'L') {
      return [
        this.templateCostsMainnet[evmNetwork][templateId].last,
        this.templateCostsMainnet[evmNetwork][templateId].prev,
      ];
    }
    return [
      this.templateCostsTestnet[evmNetwork][templateId].last,
      this.templateCostsTestnet[evmNetwork][templateId].prev,
    ];
  }

  private async initializeQueueWithS3Data(
    ltoNetwork_id: string,
    queueS3Bucket: any,
  ) {
    for (const entry of queueS3Bucket) {
      // Push the entry into the queue
      if (ltoNetwork_id === 'L') {
        this.queueMainnet.push({
          data: entry.data,
          rid: entry.rid,
          ltoWallet: entry.ltoWallet,
          ltoNetworkId: entry.ltoNetworkId,
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
          reenqueued: entry.reenqueued,
          reenqueued_NFTURI: entry.reenqueued_NFTURI ?? '',
          nftInfo: {
            network: entry.nftInfo.network,
            address: entry.nftInfo.address,
            id: entry.nftInfo.id,
          },
        });
      } else {
        this.queueTestnet.push({
          data: entry.data,
          rid: entry.rid,
          ltoWallet: entry.ltoWallet,
          ltoNetworkId: entry.ltoNetworkId,
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
          reenqueued: entry.reenqueued,
          reenqueued_NFTURI: entry.reenqueued_NFTURI ?? '',
          nftInfo: {
            network: entry.nftInfo.network,
            address: entry.nftInfo.address,
            id: entry.nftInfo.id,
          },
        });
      }
      if (
        (entry.ownableStatus === OwnableStatus.Sent ||
          entry.ownableStatus === OwnableStatus.Ready ||
          entry.ownableStatus === OwnableStatus.Processing ||
          entry.ownableStatus === OwnableStatus.Failed ||
          entry.ownableStatus === OwnableStatus.InQueue) &&
        entry.data
      ) {
        try {
          if (ltoNetwork_id === 'L') {
            const dataUint8Array = await this.s3.s3BucketQueue_L.get(
              entry.data,
            );
            this._queueDataMainnet.push(dataUint8Array);
          } else {
            const dataUint8Array = await this.s3.s3BucketQueue_T.get(
              entry.data,
            );
            this._queueDataTestnet.push(dataUint8Array);
          }
        } catch (err) {
          this.loggingService.log(
            entry.rid,
            `Could not load data for entry ${entry.rid} ${entry.OwnableStatus}`,
          );
        }
      }
    }
  }
  // For `getNextQueueEntry`
  private getNextQueueEntry(
    ltoNetwork_id: string,
  ): [QueueEntry, number] | [null, null] {
    if (ltoNetwork_id === 'L') {
      const entry = this.queueMainnet.find(
        (entry: QueueEntry) => entry.ownableStatus === OwnableStatus.InQueue,
      );
      return entry ? [entry, this.queueMainnet.indexOf(entry)] : [null, null];
    } else {
      const entry = this.queueTestnet.find(
        (entry: QueueEntry) => entry.ownableStatus === OwnableStatus.InQueue,
      );
      return entry ? [entry, this.queueTestnet.indexOf(entry)] : [null, null];
    }
  }

  // For `getProcessingQueueEntryIndex`
  private getQueueEntryIndexByStatus(
    ltoNetwork_id: string,
    status: OwnableStatus,
  ): number | null {
    let index: any;
    if (ltoNetwork_id === 'L') {
      index = this.queueMainnet.findIndex(
        (entry: QueueEntry) => entry.ownableStatus === status,
      );
    } else {
      index = this.queueTestnet.findIndex(
        (entry: QueueEntry) => entry.ownableStatus === status,
      );
    }
    return index >= 0 ? index : null;
  }

  public getRequestIdByTxId(txId: string): [string, 'L' | 'T'] | [null, null] {
    const entryMainnet: QueueEntry = this.queueMainnet.find(
      (entry: QueueEntry) => entry.txId === txId,
    );
    const entryTestnet: QueueEntry = this.queueTestnet.find(
      (entry: QueueEntry) => entry.txId === txId,
    );
    if (typeof entryMainnet !== 'undefined') return [entryMainnet.rid, 'L'];
    if (typeof entryTestnet !== 'undefined') return [entryTestnet.rid, 'T'];

    return [null, null];
  }

  private async enqueueEntriesStuckInReadyState(
    ltoNetwork_id: 'L' | 'T',
  ): Promise<void> {
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

    // Define a threshold time (e.g., 1 hour in seconds)
    const thresholdTime = 600;

    if (ltoNetwork_id === 'L')
      for (const entry of this.queueMainnet) {
        if (entry.ownableStatus === OwnableStatus.Ready) {
          const timeInReadyState = currentTime - entry.timestampReady;

          // Check if the entry has been stuck in the Ready state for too long
          if (timeInReadyState > thresholdTime) {
            // Reset the entry's state to InQueue and update timestamps
            entry.ownableStatus = OwnableStatus.InQueue;
            entry.timestampInQueue = currentTime;
            entry.timestampProcessing = 0;
            entry.timestampReady = 0;
            entry.reenqueued = true;
            await this.updateQueueInS3Bucket('L');

            // Notify the user via Telegram
            const formattedDate = format(
              currentTime * 1000,
              'yyyy-MM-dd HH:mm',
            );
            const botMessage = `QUEUE-ReEnqueue(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${entry.rid}\ntxID: ${entry.txId}\nltoWallet: ${entry.ltoWallet}`;
            try {
              await this.telegramService.sendMessageToTelegramBot(
                ltoNetwork_id,
                botMessage,
              );
            } catch (err) {
              console.error(`Failed to send Telegram message: ${err}`);
            }
          }
        }
      }
    if (ltoNetwork_id === 'T')
      for (const entry of this.queueTestnet) {
        if (entry.ownableStatus === OwnableStatus.Ready) {
          const timeInReadyState = currentTime - entry.timestampReady;

          // Check if the entry has been stuck in the Ready state for too long
          if (timeInReadyState > thresholdTime) {
            // Reset the entry's state to InQueue and update timestamps
            entry.ownableStatus = OwnableStatus.InQueue;
            entry.timestampInQueue = currentTime;
            entry.timestampProcessing = 0;
            entry.timestampReady = 0;
            entry.reenqueued = true;
            await this.updateQueueInS3Bucket('T');
            // Notify the user via Telegram
            const formattedDate = format(
              currentTime * 1000,
              'yyyy-MM-dd HH:mm',
            );
            const botMessage = `QUEUE-ReEnqueue(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${entry.rid}\ntxID: ${entry.txId}\nltoWallet: ${entry.ltoWallet}`;
            try {
              await this.telegramService.sendMessageToTelegramBot(
                ltoNetwork_id,
                botMessage,
              );
            } catch (err) {
              console.error(`Failed to send Telegram message: ${err}`);
            }
          }
        }
      }
  }

  // Enqueue a new Uint8Array to the queue
  public async enqueue(
    ltoNetwork_id: 'L' | 'T',
    requestId: string,
    data: Uint8Array,
    ltoWallet: string,
    txId: string,
    templateId: number,
  ): Promise<QueueEntry> {
    if (data instanceof Uint8Array) {
      const newQueueEntry: QueueEntry = {
        requestId: requestId,
        networkId: ltoNetwork_id,
        status: OwnableStatus.InQueue,
        templateId: templateId.toString(),
        sender: ltoWallet,
        transactionId: txId,
        timestamp: new Date(),
        nftInfo: {
          network: '',
          address: '',
          id: 0,
        },
        // Legacy fields for compatibility
        data: `${requestId}_data`,
        rid: `${requestId}`,
        ltoWallet: ltoWallet,
        ltoNetworkId: ltoNetwork_id,
        hash: '',
        txId: txId,
        ownableStatus: OwnableStatus.InQueue,
        timestampInQueue: Math.floor(Date.now() / 1000),
        timestampProcessing: 0,
        timestampReady: 0,
        timestampSent: 0,
        timestampFailed: 0,
        failedErrMsg: '',
        cid: '',
        reenqueued: false,
        reenqueued_NFTURI: '',
      };
      try {
        if (ltoNetwork_id === 'L') {
          await this.s3.s3BucketQueue_L.put(`${requestId}_data`, data);
        } else {
          await this.s3.s3BucketQueue_T.put(`${requestId}_data`, data);
        }
      } catch (err) {
        throw new Error(
          `Putting ${requestId}_data into s3 Bucket failed for LTO network ${ltoNetwork_id}. Error: ${err}`,
        );
      }
      const timestamp = Math.floor(Date.now());
      const formattedDate = format(timestamp, 'yyyy-MM-dd HH:mm');
      try {
        await this.telegramService.sendMessageToTelegramBot(
          ltoNetwork_id,
          `QUEUE-InQueue(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${requestId}\ntxID: ${txId}\nltoWallet: ${ltoWallet}`,
        );
      } catch (err) {
        throw new Error(`Telegram Service Error.  ${err}`);
      }
      if (ltoNetwork_id === 'L') {
        this._queueMainnet.push(newQueueEntry);
        this._queueDataMainnet.push(data);
      } else {
        this._queueTestnet.push(newQueueEntry);
        this._queueDataTestnet.push(data);
      }
      await this.enqueueEntriesStuckInReadyState(ltoNetwork_id);
      try {
        await this.updateQueueInS3Bucket(ltoNetwork_id);
      } catch (err) {
        if (ltoNetwork_id === 'L') {
          this._queueMainnet.pop();
          this._queueDataMainnet.pop();
        } else {
          this._queueTestnet.pop();
          this._queueDataTestnet.pop();
        }
        throw new Error(
          `Updating Queue in s3 bucket for LTO network ${ltoNetwork_id} failed. Error: ${err}`,
        );
      }
      return newQueueEntry;
    } else {
      throw new Error('Data must be of type Uint8Array');
    }
  }
  public showQueue() {
    console.log('this._queueTestnet', this._queueTestnet);
  }
  public getQueueEntryByRequestId(
    ltoNetwork_id: 'L' | 'T',
    requestId: string,
  ): [QueueEntry, number] {
    try {
      console.log(`======= QUEUE SEARCH =======`);
      console.log(
        `Searching for requestId: ${requestId} in ${ltoNetwork_id} network`,
      );
      // Guard against undefined or non-array queues
      if (!this._queueMainnet || !Array.isArray(this._queueMainnet))
        this._queueMainnet = [];
      if (!this._queueTestnet || !Array.isArray(this._queueTestnet))
        this._queueTestnet = [];

      // Select the correct queue
      const queue =
        ltoNetwork_id === 'L' ? this._queueMainnet : this._queueTestnet;

      // Find the index directly instead of using find + indexOf combination
      const index = queue.findIndex(
        (entry) => entry && entry.rid === requestId,
      );

      // If not found, return null and -1
      if (index === -1) {
        console.warn(
          `No entry found for requestId ${requestId} in ${ltoNetwork_id} queue`,
        );
        return [null, -1];
      }
      console.log(`✅ Found entry at index ${index}:`);
      console.log(`   rid: ${queue[index].rid}`);
      console.log(
        `   status: ${OwnableStatus[queue[index].ownableStatus]} (${queue[index].ownableStatus})`,
      );
      console.log(`   ltoWallet: ${queue[index].ltoWallet}`);
      console.log(`   txId: ${queue[index].txId || 'N/A'}`);
      console.log(`======= END QUEUE SEARCH =======`);
      // Return the entry and its index
      return [queue[index], index];
    } catch (error) {
      console.error(`Error in getQueueEntryByRequestId: ${error}`);
      return [null, -1];
    }
  }

  public getQueueEntriesByWallet(
    ltoNetwork_id: 'L' | 'T',
    ltoWallet: string,
  ): QueueEntry[] {
    const queryQueueEntries: QueueEntry[] = [];
    if (ltoNetwork_id === 'L') {
      this.queueMainnet.forEach((entry: QueueEntry) => {
        if (entry.ltoWallet === ltoWallet) {
          queryQueueEntries.push(entry);
        }
      });
    } else {
      this.queueTestnet.forEach((entry: QueueEntry) => {
        if (entry.ltoWallet === ltoWallet) {
          queryQueueEntries.push(entry);
        }
      });
    }
    return queryQueueEntries;
  }

  public getQueueEntriesByStatus(
    ltoNetwork_id: 'L' | 'T',
    status: OwnableStatus,
  ): QueueEntry[] {
    const queryQueueEntries: QueueEntry[] = [];
    if (ltoNetwork_id === 'L') {
      this.queueMainnet.forEach((entry: QueueEntry) => {
        if (entry.ownableStatus.toString() === status.toString()) {
          queryQueueEntries.push(entry);
        }
      });
    } else {
      this.queueTestnet.forEach((entry: QueueEntry) => {
        if (entry.ownableStatus.toString() === status.toString()) {
          queryQueueEntries.push(entry);
        }
      });
    }
    return queryQueueEntries;
  }

  public async setCidNftInfo(
    ltoNetwork_id: 'L' | 'T',
    requestId: string,
    cid: string,
    nftInfo: NftInfo,
    nftURI: string,
  ) {
    const [entry, index] = this.getQueueEntryByRequestId(
      ltoNetwork_id,
      requestId,
    );

    if (ltoNetwork_id === 'L') {
      this.queueMainnet[index].cid = cid;
      this.queueMainnet[index].nftInfo = nftInfo;
      this.queueMainnet[index].reenqueued_NFTURI = nftURI;
    } else {
      this.queueTestnet[index].cid = cid;
      this.queueTestnet[index].nftInfo = nftInfo;
      this.queueTestnet[index].reenqueued_NFTURI = nftURI;
    }
    try {
      await this.updateQueueInS3Bucket(ltoNetwork_id);
    } catch (err) {
      throw err;
    }
  }

  public async ownableFailed(
    ltoNetwork_id: 'L' | 'T',
    requestId: string,
    errMsg: string,
  ) {
    const [entry, index] = this.getQueueEntryByRequestId(
      ltoNetwork_id,
      requestId,
    );
    if (ltoNetwork_id === 'L') {
      if (index >= 0 && index < this.queueMainnet.length) {
        this.queueMainnet[index].timestampFailed = Math.floor(
          Date.now() / 1000,
        );
        this.queueMainnet[index].failedErrMsg = errMsg;
        this.queueMainnet[index].ownableStatus = OwnableStatus.Failed;
      } else {
        throw new Error(
          `Index ${index} for LTO network ${ltoNetwork_id} is out of bounds.`,
        );
      }
    } else {
      if (index >= 0 && index < this.queueTestnet.length) {
        this.queueTestnet[index].timestampFailed = Math.floor(
          Date.now() / 1000,
        );
        this.queueTestnet[index].failedErrMsg = errMsg;
        this.queueTestnet[index].ownableStatus = OwnableStatus.Failed;
      } else {
        throw new Error(
          `Index ${index} for LTO network ${ltoNetwork_id} is out of bounds.`,
        );
      }
    }

    try {
      if (ltoNetwork_id === 'L') {
        await this.s3.s3BucketQueue_L.put(
          `Queue.json`,
          JSON.stringify(this.queueMainnet),
        );
      } else {
        await this.s3.s3BucketQueue_T.put(
          `Queue.json`,
          JSON.stringify(this.queueTestnet),
        );
      }
    } catch (err) {
      throw new Error(
        `S3 Bucket for LTO network ${ltoNetwork_id} put Queue.json failed.  ${err}`,
      );
    }
    const timestamp = Math.floor(Date.now());
    const formattedDate = format(timestamp, 'yyyy-MM-dd HH:mm');
    try {
      let botMessage: string;
      if (ltoNetwork_id === 'L') {
        botMessage = `QUEUE-Failed(L): (${formattedDate})\nrequestId: ${requestId}\ntxID: ${this.queueMainnet[index].txId}\nltoWallet: ${this.queueMainnet[index].ltoWallet}\ncid:${this.queueMainnet[index].cid}\nerrMsg: ${this.queueMainnet[index].failedErrMsg}`;
      } else {
        botMessage = `QUEUE-Failed(T): (${formattedDate})\nrequestId: ${requestId}\ntxID: ${this.queueTestnet[index].txId}\nltoWallet: ${this.queueTestnet[index].ltoWallet}\ncid:${this.queueTestnet[index].cid}\nerrMsg: ${this.queueTestnet[index].failedErrMsg}`;
      }
      await this.telegramService.sendMessageToTelegramBot(
        ltoNetwork_id,
        botMessage,
      );
    } catch (err) {
      throw new Error(`Telegram Service Error.  ${err}`);
    }
  }

  // Fix setQueueEntryStatus to be more robust
  public async setQueueEntryStatus(
    ltoNetwork_id: 'L' | 'T',
    requestId: string,
    status: OwnableStatus,
    hash?: string,
  ): Promise<void> {
    try {
      console.log('ltoNetwork_id', ltoNetwork_id);
      console.log('requestId', requestId);
      console.log('status', status);
      console.log('hash', hash);

      this.loggingService.log(requestId, `======= QUEUE UPDATE =======`);
      this.loggingService.log(
        requestId,
        `Updating queue entry status: ${requestId} to ${OwnableStatus[status]}`,
      );

      const [entry, index] = this.getQueueEntryByRequestId(
        ltoNetwork_id,
        requestId,
      );

      if (index >= 0) {
        this.loggingService.log(
          requestId,
          `Entry with index ${index} with requestId:${entry.rid} found: ${entry}`,
        );
      }
      if (status == OwnableStatus.Processing) {
        if (ltoNetwork_id === 'L') {
          this.queueMainnet[index].timestampProcessing = Math.floor(
            Date.now() / 1000,
          );
        } else {
          this.queueTestnet[index].timestampProcessing = Math.floor(
            Date.now() / 1000,
          );
        }
      } else if (status == OwnableStatus.Ready) {
        let botMessage: string;
        let formattedDate: string;

        if (ltoNetwork_id === 'L') {
          this.queueMainnet[index].timestampReady = Math.floor(
            Date.now() / 1000,
          );
          formattedDate = format(
            this.queueMainnet[index].timestampReady * 1000,
            'yyyy-MM-dd HH:mm',
          );
          botMessage = `QUEUE-Ready(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueMainnet[index].rid}\ntxID: ${this.queueMainnet[index].txId}\nltoWallet: ${this.queueMainnet[index].ltoWallet}`;
        } else {
          this.queueTestnet[index].timestampReady = Math.floor(
            Date.now() / 1000,
          );
          formattedDate = format(
            this.queueTestnet[index].timestampReady * 1000,
            'yyyy-MM-dd HH:mm',
          );
          botMessage = `QUEUE-Ready(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueTestnet[index].rid}\ntxID: ${this.queueTestnet[index].txId}\nltoWallet: ${this.queueTestnet[index].ltoWallet}`;
        }
        try {
          await this.telegramService.sendMessageToTelegramBot(
            ltoNetwork_id,
            botMessage,
          );
        } catch (err) {
          throw new Error(`Telegram Service Error.  ${err}`);
        }
      } else if (status == OwnableStatus.Sent && typeof hash !== 'undefined') {
        let botMessage: string;
        let formattedDate: string;
        if (ltoNetwork_id === 'L') {
          this.queueMainnet[index].hash = hash;
          this.queueMainnet[index].timestampSent = Math.floor(
            Date.now() / 1000,
          );
          formattedDate = format(
            this.queueMainnet[index].timestampReady * 1000,
            'yyyy-MM-dd HH:mm',
          );
          botMessage = `QUEUE-Sent(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueMainnet[index].rid}\ntxID: ${this.queueMainnet[index].txId}\nltoWallet: ${this.queueMainnet[index].ltoWallet}\nhash: ${this.queueMainnet[index].hash}`;
        } else {
          this.queueTestnet[index].hash = hash;
          this.queueTestnet[index].timestampSent = Math.floor(
            Date.now() / 1000,
          );
          formattedDate = format(
            this.queueTestnet[index].timestampReady * 1000,
            'yyyy-MM-dd HH:mm',
          );
          botMessage = `QUEUE-Sent(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueTestnet[index].rid}\ntxID: ${this.queueTestnet[index].txId}\nltoWallet: ${this.queueTestnet[index].ltoWallet}\nhash: ${this.queueTestnet[index].hash}`;
        }
        try {
          await this.telegramService.sendMessageToTelegramBot(
            ltoNetwork_id,
            botMessage,
          );
        } catch (err) {
          throw new Error(`Telegram Service Error.  ${err}`);
        }
      } else if (status == OwnableStatus.InQueue) {
        if (ltoNetwork_id === 'L') {
          this.queueMainnet[index].timestampInQueue = Math.floor(
            Date.now() / 1000,
          );
          this.queueMainnet[index].timestampProcessing = 0;
          this.queueMainnet[index].timestampReady = 0;
        } else {
          this.queueTestnet[index].timestampInQueue = Math.floor(
            Date.now() / 1000,
          );
          this.queueTestnet[index].timestampProcessing = 0;
          this.queueTestnet[index].timestampReady = 0;
        }
      } else if (status == OwnableStatus.Failed) {
        if (ltoNetwork_id === 'L') {
          this.queueMainnet[index].timestampFailed = Math.floor(
            Date.now() / 1000,
          );
        } else {
          this.queueTestnet[index].timestampFailed = Math.floor(
            Date.now() / 1000,
          );
        }
      } else {
        throw new Error(
          `Unknown Ownable status ${status} for requestId ${requestId}`,
        );
      }
      if (ltoNetwork_id === 'L') {
        this.queueMainnet[index].ownableStatus = status;
      } else {
        this.queueTestnet[index].ownableStatus = status;
      }
      console.log('updateQueueInS3Bucket...');
      await this.updateQueueInS3Bucket(ltoNetwork_id);
    } catch (error) {
      console.error(`Error in setQueueEntryStatus: ${error}`);
      throw error;
    }
  }
  public async processNextQueueEntry(): Promise<
    | ['L' | 'T', string, Uint8Array, string, boolean, string, NftInfo]
    | [null, null, null, null, null, null, null]
  > {
    const [entryL, indexL] = this.getNextQueueEntry('L');
    if (indexL != null) {
      let data: Uint8Array = new Uint8Array([]);

      data = await this.s3.s3BucketQueue_L.get(`${entryL.rid}_data`);

      this._queueMainnet[indexL].ownableStatus = OwnableStatus.Processing;
      this._queueMainnet[indexL].timestampProcessing = Math.floor(
        Date.now() / 1000,
      );
      const formattedDate = format(
        this._queueMainnet[indexL].timestampProcessing * 1000,
        'yyyy-MM-dd HH:mm',
      );
      await this.telegramService.sendMessageToTelegramBot(
        this.queueMainnet[indexL].ltoNetworkId,
        `QUEUE-Processing(L): (${formattedDate})\nrequestId: ${this.queueMainnet[indexL].rid}\ntxID: ${this.queueMainnet[indexL].txId}\nltoWallet: ${this.queueMainnet[indexL].ltoWallet}`,
      );
      await this.updateQueueInS3Bucket(this.queueMainnet[indexL].ltoNetworkId);
      return [
        'L',
        entryL.rid,
        data,
        entryL.ltoWallet,
        entryL.reenqueued,
        entryL.reenqueued_NFTURI,
        entryL.nftInfo,
      ];
    } else {
      const [entryT, indexT] = this.getNextQueueEntry('T');
      if (indexT != null) {
        let data: Uint8Array = new Uint8Array([]);

        data = await this.s3.s3BucketQueue_T.get(`${entryT.rid}_data`);
        this._queueTestnet[indexT].ownableStatus = OwnableStatus.Processing;
        this._queueTestnet[indexT].timestampProcessing = Math.floor(
          Date.now() / 1000,
        );
        const formattedDate = format(
          this._queueTestnet[indexT].timestampProcessing * 1000,
          'yyyy-MM-dd HH:mm',
        );
        await this.telegramService.sendMessageToTelegramBot(
          this.queueTestnet[indexT].ltoNetworkId,
          `QUEUE-Processing(T): (${formattedDate})\nrequestId: ${this.queueTestnet[indexT].rid}\ntxID: ${this.queueTestnet[indexT].txId}\nltoWallet: ${this.queueTestnet[indexT].ltoWallet}`,
        );
        await this.updateQueueInS3Bucket(
          this.queueTestnet[indexT].ltoNetworkId,
        );
        return [
          'T',
          entryT.rid,
          data,
          entryT.ltoWallet,
          entryT.reenqueued,
          entryT.reenqueued_NFTURI,
          entryT.nftInfo,
        ];
      } else {
        // console.log('Queue is empty');
        return [null, null, null, null, null, null, null];
      }
    }
  }
  public canProcessNewEntry(): boolean {
    const indexMainnetProcessing = this.getQueueEntryIndexByStatus(
      'L',
      OwnableStatus.Processing,
    );
    const indexTestnetProcessing = this.getQueueEntryIndexByStatus(
      'T',
      OwnableStatus.Processing,
    );
    const indexMainnetReady = this.getQueueEntryIndexByStatus(
      'L',
      OwnableStatus.Ready,
    );
    const indexTestnetReady = this.getQueueEntryIndexByStatus(
      'T',
      OwnableStatus.Ready,
    );

    if (
      indexMainnetProcessing != null ||
      indexTestnetProcessing != null ||
      indexMainnetReady != null ||
      indexTestnetReady != null
    ) {
      console.log('canProcessNewEntry: false');
      console.log('indexMainnetProcessing', indexMainnetProcessing);
      console.log('indexTestnetProcessing', indexTestnetProcessing);
      console.log('indexMainnetReady', indexMainnetReady);
      console.log('indexTestnetReady', indexTestnetReady);
      return false;
    }
    console.log('canProcessNewEntry: true');
    return true;
  }

  public isCreatingOwnable(): string {
    const indexMainnetProcessing = this.getQueueEntryIndexByStatus(
      'L',
      OwnableStatus.Processing,
    );
    const indexTestnetProcessing = this.getQueueEntryIndexByStatus(
      'T',
      OwnableStatus.Processing,
    );
    const indexMainnetReady = this.getQueueEntryIndexByStatus(
      'L',
      OwnableStatus.Ready,
    );
    const indexTestnetReady = this.getQueueEntryIndexByStatus(
      'T',
      OwnableStatus.Ready,
    );

    if (indexMainnetProcessing != null || indexMainnetReady != null) {
      console.log('isCreatingOwnable: L');
      return 'L';
    } else if (indexTestnetProcessing != null || indexTestnetReady != null) {
      console.log('isCreatingOwnable: T');
      return 'T';
    }
    console.log("isCreatingOwnable: ''");
    return '';
  }

  public isQueueEmpty(): boolean {
    const indexMainnet = this.getQueueEntryIndexByStatus(
      'L',
      OwnableStatus.InQueue,
    );
    const indexTestnet = this.getQueueEntryIndexByStatus(
      'T',
      OwnableStatus.InQueue,
    );
    if (indexMainnet != null || indexTestnet != null) {
      return false;
    }
    return true;
  }
}
