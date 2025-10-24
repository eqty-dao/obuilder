import { Injectable, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { RedisQueueService } from '../queue/redis-queue.service';

const axios = require('axios');

@Injectable()
export class CoinmarketcapService implements OnModuleInit {
  private latestPriceARBUSD: number;
  private latestPriceLTOUSD: number;
  private previousPriceARBUSD: number;
  private previousPriceLTOUSD: number;
  private latestApiCall: number;
  private apiCallIntervalSec: number;
  private templateCostsUSD_L: number;
  private templateCostsUSD_T: number;
  private initialized: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: RedisQueueService,
    private readonly telegramService: TelegramBotService,
  ) {
    if (!this.initialized) {
      this.initialized = true;
      this.latestPriceARBUSD = 0;
      this.latestPriceLTOUSD = 0;
      this.previousPriceARBUSD = 0;
      this.previousPriceLTOUSD = 0;
      this.apiCallIntervalSec = 3600; // 1h in seconds
      //   this.apiCallIntervalSec = 10; // in seconds
      this.latestApiCall = 0;
      this.templateCostsUSD_L = 0.16;
      this.templateCostsUSD_T = 0.16;
    } else {
      console.log('Initialized');
    }
  }

  async onModuleInit() {
    if (
      typeof this.config.get('eqty.templateCostsUSD.mainnet') !== 'undefined'
    ) {
      this.templateCostsUSD_L = parseFloat(
        this.config.get('eqty.templateCostsUSD.mainnet'),
      );
      console.log('templateCostsUSD_L', this.templateCostsUSD_L);
    }
    if (
      typeof this.config.get('eqty.templateCostsUSD.testnet') !== 'undefined'
    ) {
      this.templateCostsUSD_T = parseFloat(
        this.config.get('eqty.templateCostsUSD.testnet'),
      );
      console.log('templateCostsUSD_T', this.templateCostsUSD_T);
    }
    if (this.latestApiCall == 0) {
      await this.getLatestPrice();
    }
  }
  public async getLatestPrice(forceUpdate: boolean = false): Promise<void> {
    const timeNow = Math.floor(Date.now() / 1000);

    // Check if we need to update prices - either forced or time interval passed
    if (forceUpdate || timeNow > this.latestApiCall + this.apiCallIntervalSec) {
      this.latestApiCall = timeNow;
      console.log('Updating template costs from CoinMarketCap');

      const url =
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

      try {
        const response = await axios.get(url, {
          headers: {
            'X-CMC_PRO_API_KEY': this.config.get('coinmarketcap'),
          },
          params: {
            symbol: 'LTO,ARB', // Fetch data for LTO and ARB
            convert: 'USD', // Convert prices to USD
          },
        });

        const data = response.data.data;

        let prevPrice_L = 0;
        let prevPrice_T = 0;
        if (this.previousPriceLTOUSD > 0) {
          prevPrice_L = Math.floor(
            (1 / this.previousPriceLTOUSD) *
              this.templateCostsUSD_L *
              100000000,
          );
          prevPrice_T = Math.floor(
            (1 / this.previousPriceLTOUSD) *
              this.templateCostsUSD_T *
              100000000,
          );
        }

        this.previousPriceARBUSD = this.latestPriceARBUSD;
        this.previousPriceLTOUSD = this.latestPriceLTOUSD;

        this.latestPriceARBUSD = parseFloat(
          data.ARB.quote.USD.price.toFixed(8),
        );
        this.latestPriceLTOUSD = parseFloat(
          data.LTO.quote.USD.price.toFixed(8),
        );

        let newPrice_L = 20000000;
        let newPrice_T = 20000000;
        if (this.latestPriceLTOUSD > 0) {
          newPrice_L = Math.floor(
            (1 / this.latestPriceLTOUSD) * this.templateCostsUSD_L * 100000000,
          );
          newPrice_T = Math.floor(
            (1 / this.latestPriceLTOUSD) * this.templateCostsUSD_T * 100000000,
          );
        }

        console.log(
          'Updated LTO prices - Mainnet:',
          newPrice_L,
          'Testnet:',
          newPrice_T,
        );

        // Pass validated whole numbers to setTemplateCosts
        await this.queue.setTemplateCosts(
          'L',
          'arbitrum',
          '1',
          newPrice_L,
          prevPrice_L,
          this.templateCostsUSD_L,
        );
        await this.queue.setTemplateCosts(
          'T',
          'arbitrum',
          '1',
          newPrice_T,
          prevPrice_T,
          this.templateCostsUSD_T,
        );
        await this.queue.setTemplateCosts(
          'L',
          'arbitrum',
          '2',
          newPrice_L,
          prevPrice_L,
          this.templateCostsUSD_L,
        );
        await this.queue.setTemplateCosts(
          'T',
          'arbitrum',
          '2',
          newPrice_T,
          prevPrice_T,
          this.templateCostsUSD_T,
        );
        await this.queue.setTemplateCosts(
          'L',
          'arbitrum',
          '3',
          newPrice_L,
          prevPrice_L,
          this.templateCostsUSD_L,
        );
        await this.queue.setTemplateCosts(
          'T',
          'arbitrum',
          '3',
          newPrice_T,
          prevPrice_T,
          this.templateCostsUSD_T,
        );

        // Return the updated values for reference
        return;
      } catch (error) {
        console.error('CoinMarketCap API error:', error);
        this.telegramService.sendMessageToTelegramBot(
          'L',
          `Error fetching data from CoinMarketCap: ${error.message}`,
        );
        throw error; // Rethrow to properly handle in calling code
      }
    } else {
      console.log(
        'Using cached template costs - last updated at:',
        new Date(this.latestApiCall * 1000).toISOString(),
      );
    }
  }
}
