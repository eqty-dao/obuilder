import { Injectable, OnModuleInit } from '@nestjs/common';

import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { QueueError } from '../interfaces/error';
import { NftInfo } from 'src/interfaces/OwnableInfo';
import { format } from 'date-fns';
// import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { S3Service } from '../s3/s3.service';


@Injectable()
export class QueueService implements OnModuleInit {

	private queueMainnet = [];
	private queueDataMainnet = [];
	private queueTestnet = [];
	private queueDataTestnet = [];
	private isQueueingMainnet: boolean;
	private isQueueingTestnet: boolean;
	private templateCostsMainnet: any = {};
	private templateCostsTestnet: any = {};


	constructor(
		// private readonly config: ConfigService,
		private readonly telegramService: TelegramBotService,
		private readonly s3: S3Service
	) {
		this.isQueueingMainnet = true;
		this.isQueueingTestnet = true;
	}


	async onModuleInit() {
		//await this.s3.load();
		// await this.updateQueueInS3Bucket('L');
		// await this.updateQueueInS3Bucket('T');

		try {
			// Now try to retrieve the Mainnet Queue.json file
			const existQueueJson_L = await this.s3.checkFileExists('L', 'Queue.json');
			if (existQueueJson_L) {
				const queueMainFileBuffer = await this.s3.s3BucketQueue_L.get('Queue.json');
				const queueMainFileJsonString = queueMainFileBuffer.toString('utf-8');
				const queueMainFileJsonData = JSON.parse(queueMainFileJsonString);
				await this.initializeQueueWithS3Data('L', queueMainFileJsonData);
			} else {
				console.log("Queue.json does not exist on Mainnet S3 Bucket. Creating one ...");
				await this.updateQueueInS3Bucket('L');
			}
		} catch (err) {
			console.error("Error initializing Queue with S3 data:", err);
			await this.updateQueueInS3Bucket('L');
		}

		try {
			// Now try to retrieve the Testnet Queue.json file
			const existQueueJson_T = await this.s3.checkFileExists('T', 'Queue.json');
			if (existQueueJson_T) {

				const queueTestFileBuffer = await this.s3.s3BucketQueue_T.get('Queue.json');
				const queueTestFileJsonString = queueTestFileBuffer.toString('utf-8');
				const queueTestFileJsonData = JSON.parse(queueTestFileJsonString);
				// console.log("queueTestFileJsonData", queueTestFileJsonData);
				await this.initializeQueueWithS3Data('T', queueTestFileJsonData);
			} else {
				console.log("Queue.json does not exist on Testnet S3 Bucket. Creating one ...");
				await this.updateQueueInS3Bucket('T');
			}
		} catch (err) {
			console.error("Error initializing Queue with S3 data:", err);
			await this.updateQueueInS3Bucket('T');
		}


	}

	private async updateQueueInS3Bucket(network_id: string) {
		const queue = network_id === 'L' ? this.queueMainnet : this.queueTestnet;

		// Ensure data is JSON-compatible
		const processedQueue = queue.map((entry: any) => ({
			...entry,
			// data: Buffer.isBuffer(entry.data) ? entry.data.toString('utf8') : entry.data,
			data: entry.data.toString('utf8')
		}));
		// console.log("processedQueue", processedQueue)
		try {
			if (network_id === 'L') {
				await this.s3.s3BucketQueue_L.put(`Queue.json`, JSON.stringify(processedQueue));
			} else {
				await this.s3.s3BucketQueue_T.put(`Queue.json`, JSON.stringify(processedQueue));
			}
		} catch (err) {
			throw new QueueError(`Failed to initiate Queue.json on s3Bucket`);
		}
	}

	public async setTemplateCosts(ltoNetwork_id: 'L' | 'T', evmNetwork: string, templateId: string, lastValue: number, prevValue: number, usdValue: number) {

		if (typeof this.templateCostsTestnet[evmNetwork] !== 'object') {
			this.templateCostsTestnet = {				
				"arbitrum": {
					"1": {
						"last": "20000000",
						"prev": "20000000"
					}
				},
			};
			// await this.updateTemplateCostsInS3Bucket('T');
		}
		if (typeof this.templateCostsMainnet[evmNetwork] !== 'object') {
			this.templateCostsMainnet = {				
				"arbitrum": {
					"1": {
						"last": "20000000",
						"prev": "20000000"
					}
				},
			};
			// await this.updateTemplateCostsInS3Bucket('L');
		}
		if (ltoNetwork_id === 'L') {
			this.templateCostsMainnet[evmNetwork][templateId]['last'] = lastValue.toString();
			if (prevValue > 0) {
				this.templateCostsMainnet[evmNetwork][templateId]['prev'] = prevValue.toString();
			} else {
				this.templateCostsMainnet[evmNetwork][templateId]['prev'] = lastValue.toString();
			}
		}
		else if (ltoNetwork_id === 'T') {
			this.templateCostsTestnet[evmNetwork][templateId]['last'] = lastValue.toString();
			if (prevValue > 0) {
				this.templateCostsTestnet[evmNetwork][templateId]['prev'] = prevValue.toString();
			} else {
				this.templateCostsTestnet[evmNetwork][templateId]['prev'] = lastValue.toString();
			}
		}

		// await this.updateTemplateCostsInS3Bucket(ltoNetwork_id);
		await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, `Updated template ${templateId} price ${ltoNetwork_id} (${evmNetwork}): from ${prevValue} to ${lastValue} LTO (${usdValue} USD)`);
	}

	public getTemplateCosts(ltoNetwork_id: 'L' | 'T', evmNetwork: string, templateId: string): string {
		// await this.coinmarketcap.getLatestPrice();
		if (ltoNetwork_id === 'L') {
			return this.templateCostsMainnet[evmNetwork][templateId].last;
		}
		return this.templateCostsTestnet[evmNetwork][templateId].last;

	}
	public getTemplateCostsIncludingPrevious(ltoNetwork_id: 'L' | 'T', evmNetwork: string, templateId: string): [string, string] {
		if (ltoNetwork_id === 'L') {
			return [this.templateCostsMainnet[evmNetwork][templateId].last, this.templateCostsMainnet[evmNetwork][templateId].prev];
		}
		return [this.templateCostsTestnet[evmNetwork][templateId].last, this.templateCostsTestnet[evmNetwork][templateId].prev];
	}

	private async initializeQueueWithS3Data(ltoNetwork_id: string, queueS3Bucket: any) {
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
					nftInfo: {
						network: '',
						address: '',
						id: 0
					}
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
					nftInfo: {
						network: '',
						address: '',
						id: 0
					}
				});
			}
			// Check if the status is not Unknown before fetching data
			if (entry.ownableStatus !== OwnableStatus.Unknown) {
				console.log("entry.data", entry.data);
				try {
					if (ltoNetwork_id === 'L') {
						const dataUint8Array = await this.s3.s3BucketQueue_L.get(entry.data);
						this.queueDataMainnet.push(dataUint8Array);
					} else {
						const dataUint8Array = await this.s3.s3BucketQueue_T.get(entry.data);
						this.queueDataTestnet.push(dataUint8Array);
					}
				} catch (err) {
					// throw new QueueError(`Failed to get ${entry.data} from s3Bucket for lto Network ${ltoNetwork_id}`);
					throw new QueueError(`Failed to get entry.data from s3Bucket for lto Network ${ltoNetwork_id}`);

				}
			} else {
				// If status is Unknown, push an empty Uint8Array
				if (ltoNetwork_id === 'L') {
					this.queueDataMainnet.push(new Uint8Array([]));
				} else {
					this.queueDataTestnet.push(new Uint8Array([]));
				}
			}
		}

	}
	// For `getNextQueueEntry`
	private getNextQueueEntry(ltoNetwork_id: string): [QueueEntry, number] | [null, null] {
		if (ltoNetwork_id === 'L') {
			const entry = this.queueMainnet.find((entry: QueueEntry) => entry.ownableStatus === OwnableStatus.InQueue);
			return entry ? [entry, this.queueMainnet.indexOf(entry)] : [null, null];
		} else {
			const entry = this.queueTestnet.find((entry: QueueEntry) => entry.ownableStatus === OwnableStatus.InQueue);
			return entry ? [entry, this.queueTestnet.indexOf(entry)] : [null, null];
		}
	}

	// For `getProcessingQueueEntryIndex`
	private getQueueEntryIndexByStatus(ltoNetwork_id: string, status: OwnableStatus): number | null {
		let index: any;
		if (ltoNetwork_id === 'L') {
			index = this.queueMainnet.findIndex((entry: QueueEntry) => entry.ownableStatus === status);
		} else {
			index = this.queueTestnet.findIndex((entry: QueueEntry) => entry.ownableStatus === status);
		}
		return index >= 0 ? index : null;
	}

	public getRequestIdByTxId(txId: string): [string, 'L' | 'T'] | [null, null] {
		const entryMainnet: QueueEntry = this.queueMainnet.find((entry: QueueEntry) => entry.txId === txId);
		const entryTestnet: QueueEntry = this.queueTestnet.find((entry: QueueEntry) => entry.txId === txId);
		if (typeof entryMainnet !== 'undefined') return [entryMainnet.rid, 'L'];
		if (typeof entryTestnet !== 'undefined') return [entryTestnet.rid, 'T'];

		return [null, null];
	}

	private async enqueueEntriesStuckInReadyState(ltoNetwork_id: 'L' | 'T'): Promise<void> {
		const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

		// Define a threshold time (e.g., 1 hour in seconds)
		const thresholdTime = 60;


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
						const formattedDate = format(currentTime * 1000, 'yyyy-MM-dd HH:mm');
						const botMessage = `QUEUE-ReEnqueue(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${entry.rid}\ntxID: ${entry.txId}\nltoWallet: ${entry.ltoWallet}`;
						try {
							await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, botMessage);
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
						const formattedDate = format(currentTime * 1000, 'yyyy-MM-dd HH:mm');
						const botMessage = `QUEUE-ReEnqueue(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${entry.rid}\ntxID: ${entry.txId}\nltoWallet: ${entry.ltoWallet}`;
						try {
							await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, botMessage);
						} catch (err) {
							console.error(`Failed to send Telegram message: ${err}`);
						}
					}
				}
			}


	}

	// Enqueue a new Uint8Array to the queue
	public async enqueue(ltoNetwork_id: 'L' | 'T', requestId: string, data: Uint8Array, ltoWallet: string, txId: string, templateId: number): Promise<QueueEntry> {
		if (data instanceof Uint8Array) {

			const newQueueEntry: QueueEntry = {
				data: `${requestId}_data`,
				rid: `${requestId}`,
				ltoWallet: ltoWallet,
				ltoNetworkId: ltoNetwork_id,
				hash: '',
				txId: txId,
				ownableStatus: OwnableStatus.InQueue,
				templateId: templateId,
				timestampInQueue: Math.floor(Date.now() / 1000),
				timestampProcessing: 0,
				timestampReady: 0,
				timestampSent: 0,
				timestampFailed: 0,
				failedErrMsg: '',
				cid: '',
				reenqueued: false,
				nftInfo: {
					network: '',
					address: '',
					id: 0
				}
			}
			try {
				if (ltoNetwork_id === 'L') {
					await this.s3.s3BucketQueue_L.put(`${requestId}_data`, data);
				} else {
					await this.s3.s3BucketQueue_T.put(`${requestId}_data`, data);

				}
			} catch (err) {
				throw new Error(`Putting ${requestId}_data into s3 Bucket failed for LTO network ${ltoNetwork_id}. Error: ${err}`);
			}
			const timestamp = Math.floor(Date.now());
			const formattedDate = format(timestamp, 'yyyy-MM-dd HH:mm');
			try {
				await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, `QUEUE-InQueue(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${requestId}\ntxID: ${txId}\nltoWallet: ${ltoWallet}`);
			} catch (err) {
				throw new Error(`Telegram Service Error.  ${err}`);
			}
			if (ltoNetwork_id === 'L') {
				this.queueMainnet.push(newQueueEntry);
				this.queueDataMainnet.push(data);
			} else {
				this.queueTestnet.push(newQueueEntry);
				this.queueDataTestnet.push(data);
			}
			await this.enqueueEntriesStuckInReadyState(ltoNetwork_id);
			try {
				await this.updateQueueInS3Bucket(ltoNetwork_id);
			} catch (err) {
				if (ltoNetwork_id === 'L') {
					this.queueMainnet.pop();
					this.queueDataMainnet.pop();
				} else {
					this.queueTestnet.pop();
					this.queueDataTestnet.pop();
				}
				throw new Error(`Updating Queue in s3 bucket for LTO network ${ltoNetwork_id} failed. Error: ${err}`);
			}
			return newQueueEntry;

		} else {
			throw new Error('Data must be of type Uint8Array');
		}
	}

	public getQueueEntryByRequestId(ltoNetwork_id: 'L' | 'T', requestId: string): [QueueEntry, number] {
		const defaultQueueEntry = {
			data: '',
			rid: '',
			ltoWallet: '',
			ltoNetworkId: ltoNetwork_id,
			hash: '',
			txId: '',
			ownableStatus: OwnableStatus.Unknown,
			templateId: 0,
			timestampInQueue: 0,
			timestampProcessing: 0,
			timestampReady: 0,
			timestampSent: 0,
			timestampFailed: 0,
			failedErrMsg: '',
			cid: '',
			reenqueued: false,
			nftInfo: {
				network: '',
				address: '',
				id: 0
			}
		};
		if (ltoNetwork_id === 'L') {
			const entry = this.queueMainnet.find((entry: QueueEntry) => entry.rid === requestId);
			return entry ? [entry, this.queueMainnet.indexOf(entry)] : [defaultQueueEntry, 0];
		} else {
			const entry = this.queueTestnet.find((entry: QueueEntry) => entry.rid === requestId);
			return entry ? [entry, this.queueTestnet.indexOf(entry)] : [defaultQueueEntry, 0];

		}
	}


	public getQueueEntriesByWallet(ltoNetwork_id: 'L' | 'T', ltoWallet: string): QueueEntry[] {
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

	public getQueueEntriesByStatus(ltoNetwork_id: 'L' | 'T', status: OwnableStatus): QueueEntry[] {
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

	public async setCidNftInfo(ltoNetwork_id: 'L' | 'T', requestId: string, cid: string, nftInfo: NftInfo) {
		const [entry, index] = this.getQueueEntryByRequestId(ltoNetwork_id, requestId);

		if (ltoNetwork_id === 'L') {
			this.queueMainnet[index].cid = cid;
			this.queueMainnet[index].nftInfo = nftInfo;
		} else {
			this.queueTestnet[index].cid = cid;
			this.queueTestnet[index].nftInfo = nftInfo;

		}
		try {
			await this.updateQueueInS3Bucket(ltoNetwork_id);
		} catch (err) {
			throw err;
		}
	}

	public async ownableFailed(ltoNetwork_id: 'L' | 'T', requestId: string, errMsg: string) {
		const [entry, index] = this.getQueueEntryByRequestId(ltoNetwork_id, requestId);
		if (ltoNetwork_id === 'L') {
			if (index >= 0 && index < this.queueMainnet.length) {
				this.queueMainnet[index].timestampFailed = Math.floor(Date.now() / 1000);
				this.queueMainnet[index].failedErrMsg = errMsg;
				this.queueMainnet[index].ownableStatus = OwnableStatus.Failed;
			} else {
				throw new Error(`Index ${index} for LTO network ${ltoNetwork_id} is out of bounds.`);
			}
		} else {
			if (index >= 0 && index < this.queueTestnet.length) {
				this.queueTestnet[index].timestampFailed = Math.floor(Date.now() / 1000);
				this.queueTestnet[index].failedErrMsg = errMsg;
				this.queueTestnet[index].ownableStatus = OwnableStatus.Failed;
			} else {
				throw new Error(`Index ${index} for LTO network ${ltoNetwork_id} is out of bounds.`);
			}
		}

		try {
			if (ltoNetwork_id === 'L') {
				await this.s3.s3BucketQueue_L.put(`Queue.json`, JSON.stringify(this.queueMainnet));
			} else {
				await this.s3.s3BucketQueue_T.put(`Queue.json`, JSON.stringify(this.queueTestnet));
			}
		} catch (err) {
			throw new Error(`S3 Bucket for LTO network ${ltoNetwork_id} put Queue.json failed.  ${err}`);
		}
		const timestamp = Math.floor(Date.now());
		const formattedDate = format(timestamp, 'yyyy-MM-dd HH:mm');
		try {
			let botMessage: string;
			if (ltoNetwork_id === 'L') {
				botMessage = `QUEUE-Failed(L): (${formattedDate})\nrequestId: ${requestId}\ntxID: ${this.queueMainnet[index].txId}\nltoWallet: ${this.queueMainnet[index].ltoWallet}\ncid:${this.queueMainnet[index].cid}\nerrMsg: ${this.queueMainnet[index].failedErrMsg}`
			} else {
				botMessage = `QUEUE-Failed(T): (${formattedDate})\nrequestId: ${requestId}\ntxID: ${this.queueTestnet[index].txId}\nltoWallet: ${this.queueTestnet[index].ltoWallet}\ncid:${this.queueMainnet[index].cid}\nerrMsg: ${this.queueTestnet[index].failedErrMsg}`
			}
			await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, botMessage);
		} catch (err) {
			throw new Error(`Telegram Service Error.  ${err}`);
		}
	}
	
	// public async moveBackFailedEntries() {
	// 	const entry = this.queueTestnet.find((entry: QueueEntry) => entry.ownableStatus === OwnableStatus.Failed);
	// 	entry.ownableStatus = OwnableStatus.InQueue;
	// 	entry.timestampInQueue = Math.floor(Date.now() / 1000);
	// 	entry.timestampProcessing = 0;
	// 	entry.timestampReady = 0;
	// 	entry.timestampSent= 0;
	// 	entry.timestampFailed = 0;
	// 	entry.failedErrMsg= '';
	// 	entry.reenqueued= true;
		
	// }

	public async setQueueEntryStatus(ltoNetwork_id: 'L' | 'T', requestId: string, status: OwnableStatus, hash?: string) {
		const [entry, index] = this.getQueueEntryByRequestId(ltoNetwork_id, requestId);

		if (status == OwnableStatus.Processing) {
			if (ltoNetwork_id === 'L') {
				this.queueMainnet[index].timestampProcessing = Math.floor(Date.now() / 1000);
			} else {
				this.queueTestnet[index].timestampProcessing = Math.floor(Date.now() / 1000);
			}
		} else if (status == OwnableStatus.Ready) {
			let botMessage: string;
			let formattedDate: string;

			if (ltoNetwork_id === 'L') {
				this.queueMainnet[index].timestampReady = Math.floor(Date.now() / 1000);
				formattedDate = format(this.queueMainnet[index].timestampReady * 1000, 'yyyy-MM-dd HH:mm');
				botMessage = `QUEUE-Ready(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueMainnet[index].rid}\ntxID: ${this.queueMainnet[index].txId}\nltoWallet: ${this.queueMainnet[index].ltoWallet}`;
			} else {
				this.queueTestnet[index].timestampReady = Math.floor(Date.now() / 1000);
				formattedDate = format(this.queueTestnet[index].timestampReady * 1000, 'yyyy-MM-dd HH:mm');
				botMessage = `QUEUE-Ready(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueTestnet[index].rid}\ntxID: ${this.queueTestnet[index].txId}\nltoWallet: ${this.queueTestnet[index].ltoWallet}`;

			}
			try {
				await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, botMessage);
			} catch (err) {
				throw new Error(`Telegram Service Error.  ${err}`);
			}

		} else if (status == OwnableStatus.Sent && typeof hash !== 'undefined') {
			let botMessage: string;
			let formattedDate: string;
			if (ltoNetwork_id === 'L') {
				this.queueMainnet[index].hash = hash;
				this.queueMainnet[index].timestampSent = Math.floor(Date.now() / 1000);
				formattedDate = format(this.queueMainnet[index].timestampReady * 1000, 'yyyy-MM-dd HH:mm');
				botMessage = `QUEUE-Sent(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueMainnet[index].rid}\ntxID: ${this.queueMainnet[index].txId}\nltoWallet: ${this.queueMainnet[index].ltoWallet}\nhash: ${this.queueMainnet[index].hash}`;
			} else {
				this.queueTestnet[index].hash = hash;
				this.queueTestnet[index].timestampSent = Math.floor(Date.now() / 1000);
				formattedDate = format(this.queueTestnet[index].timestampReady * 1000, 'yyyy-MM-dd HH:mm');
				botMessage = `QUEUE-Sent(${ltoNetwork_id}): (${formattedDate})\nrequestId: ${this.queueTestnet[index].rid}\ntxID: ${this.queueTestnet[index].txId}\nltoWallet: ${this.queueTestnet[index].ltoWallet}\nhash: ${this.queueTestnet[index].hash}`;

			}
			try {
				await this.telegramService.sendMessageToTelegramBot(ltoNetwork_id, botMessage);
			} catch (err) {
				throw new Error(`Telegram Service Error.  ${err}`);
			}

		} else if (status == OwnableStatus.InQueue) {
			if (ltoNetwork_id === 'L') {
				this.queueMainnet[index].timestampInQueue = Math.floor(Date.now() / 1000);
				this.queueMainnet[index].timestampProcessing = 0;
				this.queueMainnet[index].timestampReady = 0;
			} else {
				this.queueTestnet[index].timestampInQueue = Math.floor(Date.now() / 1000);
				this.queueTestnet[index].timestampProcessing = 0;
				this.queueTestnet[index].timestampReady = 0;

			}

		} else if (status == OwnableStatus.Failed) {
			if (ltoNetwork_id === 'L') {
				this.queueMainnet[index].timestampFailed = Math.floor(Date.now() / 1000);
			} else {
				this.queueTestnet[index].timestampFailed = Math.floor(Date.now() / 1000);

			}
		} else {
			throw new Error(`Unknown Ownable status ${status} for requestId ${requestId}`);
		}
		if (ltoNetwork_id === 'L') {
			this.queueMainnet[index].ownableStatus = status;
		} else {
			this.queueTestnet[index].ownableStatus = status;

		}
		console.log("updateQueueInS3Bucket...");
		await this.updateQueueInS3Bucket(ltoNetwork_id);
	}

	public async processNextQueueEntry(): Promise<['L' | 'T', string, Uint8Array, string, boolean] | [null, null, null, null]> {

		const [entryL, indexL] = this.getNextQueueEntry('L');
		if (indexL != null) {
			let data: Uint8Array = new Uint8Array([]);

			data = this.queueDataMainnet[indexL];
			this.queueMainnet[indexL].ownableStatus = OwnableStatus.Processing;
			this.queueMainnet[indexL].timestampProcessing = Math.floor(Date.now() / 1000);
			const formattedDate = format(this.queueMainnet[indexL].timestampProcessing * 1000, 'yyyy-MM-dd HH:mm');
			await this.telegramService.sendMessageToTelegramBot(this.queueMainnet[indexL].ltoNetworkId, `QUEUE-Processing(L): (${formattedDate})\nrequestId: ${this.queueMainnet[indexL].rid}\ntxID: ${this.queueMainnet[indexL].txId}\nltoWallet: ${this.queueMainnet[indexL].ltoWallet}`);
			await this.updateQueueInS3Bucket(this.queueMainnet[indexL].ltoNetworkId);
			return ['L', entryL.rid, data, entryL.ltoWallet, entryL.reenqueued];
		} else {
			const [entryT, indexT] = this.getNextQueueEntry('T');
			if (indexT != null) {
				let data: Uint8Array = new Uint8Array([]);

				data = this.queueDataTestnet[indexT];
				this.queueTestnet[indexT].ownableStatus = OwnableStatus.Processing;
				this.queueTestnet[indexT].timestampProcessing = Math.floor(Date.now() / 1000);
				const formattedDate = format(this.queueTestnet[indexT].timestampProcessing * 1000, 'yyyy-MM-dd HH:mm');
				await this.telegramService.sendMessageToTelegramBot(this.queueTestnet[indexT].ltoNetworkId, `QUEUE-Processing(T): (${formattedDate})\nrequestId: ${this.queueTestnet[indexT].rid}\ntxID: ${this.queueTestnet[indexT].txId}\nltoWallet: ${this.queueTestnet[indexT].ltoWallet}`);
				await this.updateQueueInS3Bucket(this.queueTestnet[indexT].ltoNetworkId);
				return ['T', entryT.rid, data, entryT.ltoWallet, entryT.reenqueued];
			} else {
				// console.log('Queue is empty');
				return [null, null, null, null];
			}
		}
	}

	public isCreatingOwnable(): string {
		const indexMainnet = this.getQueueEntryIndexByStatus('L', OwnableStatus.Processing);
		const indexTestnet = this.getQueueEntryIndexByStatus('T', OwnableStatus.Processing);
		if (indexMainnet != null) {
			return 'L';
		}
		if (indexTestnet != null) {
			return 'T';

		}
		return '';
	}

	public isQueueEmpty(): boolean {
		const indexMainnet = this.getQueueEntryIndexByStatus('L', OwnableStatus.InQueue);
		const indexTestnet = this.getQueueEntryIndexByStatus('T', OwnableStatus.InQueue);
		if (indexMainnet != null || indexTestnet != null) {
			return false;
		}
		return true;
	}

	public allowQueueing(ltoNetwork_id: 'L' | 'T', status: boolean): void {
		if (ltoNetwork_id === 'L') {
			this.isQueueingMainnet = status;
		} else {
			this.isQueueingTestnet = status;

		}
	}

	public isQueueingAllowed(ltoNetwork_id: 'L' | 'T'): boolean {
		if (ltoNetwork_id === 'L') {
			return this.isQueueingMainnet;
		} else {
			return this.isQueueingTestnet;
		}
	}
}
