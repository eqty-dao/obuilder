import { Injectable, OnModuleInit } from '@nestjs/common';
import { Account, LTO } from '@ltonetwork/lto';
import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';
import { LoggingService } from '../logging/logging.service';
import { QueueService } from '../queue/queue.service';
import { TransactionIdData } from '../interfaces/TransactionIdData';

@Injectable()
export class LtoService implements OnModuleInit {
  public ltoMainnet: LTO;
  public ltoTestnet: LTO;
  public ltoAccountMainnet: Account;
  public ltoAccountTestnet: Account;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggingService: LoggingService,
    private readonly queueService: QueueService,
  ) {
    //INFO: If ConfigService is added to the lto.module (or other modules) as provider, the Config module is not initialized yet !
    // then use onModuleInit with the await config.load() function
    // Initialize LTO instances for Mainnet and Testnet
    this.ltoMainnet = new LTO('L');
    this.ltoTestnet = new LTO('T');
    // Initialize the accounts using seeds from the config service
    this.ltoAccountMainnet = this.ltoMainnet.account({
      seed: this.config.get('lto.account.seed.mainnet'),
    });
    this.ltoAccountTestnet = this.ltoTestnet.account({
      seed: this.config.get('lto.account.seed.testnet'),
    });
  }
  async onModuleInit() {
    await this.config.load(); // Explicitly ensure config is loaded before using it
  }
  /**
   * Check if an LTO transaction ID has already been used
   * @param ltoTransactionId The transaction ID to check
   * @param requestId Current request ID for logging
   */
  public async checkReuseOfTxId(
    ltoTransactionId: string,
    requestId: string,
  ): Promise<void> {
    this.loggingService.log(
      requestId,
      `Checking if TX ID ${ltoTransactionId} has already been used for a previous request`,
    );
    const [previousRequestId, networkID] =
      this.queueService.getRequestIdByTxId(ltoTransactionId);
    console.log('checkReuseOfTxId: previousRequestId', previousRequestId);
    console.log('checkReuseOfTxId: requestId', requestId);
    console.log('checkReuseOfTxId: networkID', networkID);
    if (previousRequestId != null && previousRequestId !== requestId) {
      this.loggingService.logError(
        requestId,
        `LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId} on LTO network ${networkID}`,
      );
      throw `LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId} on LTO network ${networkID}`;
    }
  }
  /**
   * Verify an LTO transaction ID and its details
   * @param ltoNetworkId L for mainnet, T for testnet
   * @param ltoTransactionId Transaction ID to verify
   * @param templateId Template ID for cost verification
   * @param chain Blockchain name
   * @param requestId Request ID for logging
   * @param reenqueued Whether this is a reenqueued request
   * @returns Transaction data
   */
  public async checkLtoTransactionId(
    ltoNetworkId: 'L' | 'T',
    ltoTransactionId: string,
    templateId: number,
    chain: string,
    requestId: string,
    reenqueued: boolean,
  ): Promise<TransactionIdData> {
    let url: string;
    if (ltoNetworkId === 'L') {
      url = `${this.config.get('lto.node.mainnet')}/transactions/info/${ltoTransactionId}`;
    } else {
      url = `${this.config.get('lto.node.testnet')}/transactions/info/${ltoTransactionId}`;
    }

    // Add retry logic
    const maxRetries = 5;
    const retryDelay = 5000; // 5 seconds between retries
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.loggingService.log(
          requestId,
          `HTTP Request sent to: ${url} on LTO network ${ltoNetworkId} (attempt ${attempt + 1}/${maxRetries})`,
        );

        const response = await fetch(url);
        const data = await response.json();

        this.loggingService.log(
          requestId,
          `Request Done. Data: ${JSON.stringify(data)}`,
        );

        if (data.status === 'error') {
          this.loggingService.logError(
            requestId,
            `Request Failed. Data details: ${data.details}`,
          );

          // If it's the last attempt, throw the error
          if (attempt === maxRetries - 1) {
            throw new Error(data.details);
          }

          // Otherwise, wait and retry
          this.loggingService.log(
            requestId,
            `Waiting ${retryDelay / 1000} seconds to retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        // Must be of type "transaction"
        if (data.type != 4) {
          this.loggingService.logError(
            requestId,
            `Wrong Transaction type: ${data.type}`,
          );
          throw new Error('Wrong Transaction type');
        }

        const [templateCostsLast, templateCostsPrev]: [string, string] =
          await this.queueService.getTemplateCostsIncludingPrevious(
            ltoNetworkId,
            chain.toString(),
            templateId.toString(),
          );

        if (
          templateCostsLast === undefined ||
          templateCostsPrev === undefined
        ) {
          this.loggingService.logError(
            requestId,
            `Undefined templateCost for chain ${chain}`,
          );
          throw new Error(`Undefined templateCost for chain ${chain}`);
        }

        this.loggingService.log(requestId, `data.fee: ${data.fee.toString()}`);
        this.loggingService.log(
          requestId,
          `data.amount: ${data.amount.toString()}`,
        );
        this.loggingService.log(
          requestId,
          `Template Cost: ${templateCostsLast} ${templateCostsPrev}`,
        );

        // if (!reenqueued) {
        // 	if (data.amount.toString() !== templateCostsLast && data.amount.toString() !== templateCostsPrev) {
        // 		this.loggingService.logError(requestId, `Sent wrong LTO amount: ${data.amount.toString()} Correct amount should be: ${templateCostsLast} or ${templateCostsPrev}`);
        // 		throw new Error(`Sent wrong LTO amount: ${data.amount.toString()} Correct amount should be: ${templateCostsLast} or ${templateCostsPrev}`);
        // 	}
        // }
        //TO-DO - Amount should match resolve overpayment
        if (!reenqueued) {
          const amount = BigInt(data.amount);
          const prevTempCost = BigInt(templateCostsPrev);
          const lastTempCost = BigInt(templateCostsLast);

          const isEnough = amount >= prevTempCost || amount >= lastTempCost;

          if (!isEnough) {
            this.loggingService.logError(
              requestId,
              `Sent too little LTO: ${data.amount.toString()}. Must be at least ${templateCostsLast} or ${templateCostsPrev}`,
            );
            throw new Error(
              `Sent too little LTO: ${data.amount.toString()}. Must be at least ${templateCostsLast} or ${templateCostsPrev}`,
            );
          }
        }

        let thisServerAddress = this.getLTOAccountAddress(ltoNetworkId);
        if (data.recipient != thisServerAddress) {
          this.loggingService.logError(
            requestId,
            `Wrong recipient address: ${data.recipient}! Use Server LTO Wallet address: ${thisServerAddress}`,
          );
          throw new Error('Wrong recipient! Use Server LTO Wallet address');
        }

        if (!reenqueued) {
          try {
            await this.checkReuseOfTxId(ltoTransactionId, requestId);
          } catch (err) {
            this.loggingService.logError(
              requestId,
              `Check reuse of TxID failed: ${err}`,
            );
            throw new Error(`Check reuse of TxID failed: ${err}`);
          }
        }

        return {
          type: data.type,
          sender: data.sender,
          recipient: data.recipient,
          amount: data.amount,
        };
      } catch (err) {
        // If this is the last attempt, or if it's not a "transaction not found" type error, throw it
        if (
          attempt === maxRetries - 1 ||
          !err.message?.includes('not in blockchain')
        ) {
          this.loggingService.logError(
            requestId,
            `Request Failed with error: ${err}`,
          );
          throw new Error(err);
        }

        // Log the error but continue with retry
        this.loggingService.log(
          requestId,
          `Transaction not found yet, retrying in ${retryDelay / 1000} seconds...`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
  public getLTOAccountAddress(ltoNetworkId: 'L' | 'T'): string {
    return ltoNetworkId === 'L'
      ? this.ltoAccountMainnet?.address
      : this.ltoAccountTestnet?.address;
  }
  public isValidLtoAddress(address: string): string {
    const isValidMainnet = this.ltoMainnet.isValidAddress(address);
    const isValidTestnet = this.ltoTestnet.isValidAddress(address);
    if (isValidMainnet) return 'L';
    if (isValidTestnet) return 'T';
    return 'false';
  }
  public async getLTOAccountBalance(ltoNetworkId: 'L' | 'T') {
    const address = this.getLTOAccountAddress(ltoNetworkId);
    console.log('address1', address);
    let url: string;
    if (ltoNetworkId === 'L') {
      url = `${this.config.get('lto.node.mainnet')}/addresses/balance/${address}`;
    } else {
      url = `${this.config.get('lto.node.testnet')}/addresses/balance/${address}`;
    }

    // console.log("url1", url)

    const data = await this.httpService.axiosRef
      .get(url)
      .then((res) => res.data)
      .catch((err) => {
        throw new Error(
          err?.message + ': ' + JSON.stringify(err?.response?.data),
        );
      });
    // console.log("data1", data)
    return data;
  }
}
