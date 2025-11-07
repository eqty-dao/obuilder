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

      const apiKey = this.config.get('coinmarketcap');
      if (!apiKey || apiKey.trim() === '') {
        console.warn(
          'CoinMarketCap API key not configured. Skipping price update.',
        );
        return;
      }

      const url =
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

      try {
        const response = await axios.get(url, {
          headers: {
            'X-CMC_PRO_API_KEY': apiKey,
          },
          params: {
            symbol: 'ARB,ETH',
            convert: 'USD',
          },
        });

        // Check response structure
        if (!response.data) {
          throw new Error('Invalid API response: no data field');
        }

        const data = response.data.data;

        // Log available symbols for debugging
        if (data) {
          const availableSymbols = Object.keys(data);
          console.log('Available symbols in API response:', availableSymbols);
        }

        // Validate required API response structure (ARB and ETH are required)
        if (!data || !data.ARB || !data.ARB.quote || !data.ARB.quote.USD) {
          throw new Error(
            'Invalid API response: ARB data not found or malformed',
          );
        }
        if (!data.ETH || !data.ETH.quote || !data.ETH.quote.USD) {
          throw new Error(
            'Invalid API response: ETH data not found or malformed',
          );
        }

        // LTO is optional - use previous value or default if not available
        let ltoPrice = this.latestPriceLTOUSD || 0;
        if (data.LTO && data.LTO.quote && data.LTO.quote.USD) {
          ltoPrice = parseFloat(data.LTO.quote.USD.price.toFixed(8));
        } else {
          console.warn(
            'LTO price not available in API response. Using previous value or default.',
          );
        }

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
        this.latestPriceLTOUSD = ltoPrice; // Use LTO price if available, otherwise keep previous
        const latestPriceETHUSD = parseFloat(
          data.ETH.quote.USD.price.toFixed(2),
        );

        // Calculate template prices - use default if LTO price is not available
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

        // Calculate ETH amounts for Base blockchain
        let ethAmountUsd_L = 0;
        let ethAmountUsd_T = 0;
        if (latestPriceETHUSD > 0) {
          // Convert USD to ETH: $1 USD / ETH price in USD = ETH amount
          // Round to 9 decimal places to avoid precision issues with ethers.js
          ethAmountUsd_L = parseFloat(
            (this.templateCostsUSD_L / latestPriceETHUSD).toFixed(9),
          );
          ethAmountUsd_T = parseFloat(
            (this.templateCostsUSD_T / latestPriceETHUSD).toFixed(9),
          );

          console.log(
            `Base blockchain pricing: ETH = $${latestPriceETHUSD.toFixed(2)}`,
            `Cost = $${this.templateCostsUSD_L}`,
            `ETH amount = ${ethAmountUsd_L} ETH`,
          );
        }

        console.log(
          'Updated template prices - Mainnet:',
          newPrice_L,
          'Testnet:',
          newPrice_T,
          `(LTO price: ${this.latestPriceLTOUSD > 0 ? this.latestPriceLTOUSD : 'not available, using default'})`,
        );

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

        // Update Base blockchain costs with ETH amounts
        await this.queue.setTemplateCosts(
          'L',
          'base',
          '1',
          newPrice_L, // dummy value for LTO calculation
          prevPrice_L, // dummy value
          ethAmountUsd_L, // Store ETH amount
        );
        await this.queue.setTemplateCosts(
          'T',
          'base',
          '1',
          newPrice_T, // dummy value
          prevPrice_T, // dummy value
          ethAmountUsd_T, // Store ETH amount
        );
        await this.queue.setTemplateCosts(
          'L',
          'base',
          '2',
          newPrice_L,
          prevPrice_L,
          ethAmountUsd_L,
        );
        await this.queue.setTemplateCosts(
          'T',
          'base',
          '2',
          newPrice_T,
          prevPrice_T,
          ethAmountUsd_T,
        );
        await this.queue.setTemplateCosts(
          'L',
          'base',
          '3',
          newPrice_L,
          prevPrice_L,
          ethAmountUsd_L,
        );
        await this.queue.setTemplateCosts(
          'T',
          'base',
          '3',
          newPrice_T,
          prevPrice_T,
          ethAmountUsd_T,
        );

        // Return the updated values for reference
        return;
      } catch (error) {
        console.error('CoinMarketCap API error:', error);
        const errorMessage =
          error.response?.data?.status?.error_message ||
          error.message ||
          'Unknown error';
        console.error('Error details:', {
          message: errorMessage,
          status: error.response?.status,
          data: error.response?.data,
        });

        // Removed: CoinMarketCap error notifications (too frequent, errors are logged)
        // if (errorMessage && errorMessage !== 'Unknown error') {
        //   try {
        //     await this.telegramService.sendMessageToTelegramBot(
        //       'L',
        //       `Error fetching data from CoinMarketCap: ${errorMessage}`,
        //     );
        //   } catch (telegramError) {
        //     console.error(
        //       'Failed to send Telegram notification:',
        //       telegramError,
        //     );
        //   }
        // }

        // Don't throw error on module init - use fallback values instead
        if (this.latestApiCall === 0) {
          console.warn(
            'CoinMarketCap API failed on initialization. Using default/fallback values.',
          );
          // Set default values to prevent crashes
          this.latestPriceARBUSD = 0;
          this.latestPriceLTOUSD = 0;
          this.previousPriceARBUSD = 0;
          this.previousPriceLTOUSD = 0;
          return; // Don't throw, allow app to continue
        } else {
          throw error; // Rethrow for forced updates
        }
      }
    } else {
      console.log(
        'Using cached template costs - last updated at:',
        new Date(this.latestApiCall * 1000).toISOString(),
      );
    }
  }
}
