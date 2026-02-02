import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { QueueService } from 'src/queue/queue.service';

const axios = require("axios");

/**
 * CoinmarketcapService - Fetches cryptocurrency prices for template cost calculation
 * 
 * Note: CoinMarketCap still uses 'LTO' as the symbol even though the token 
 * has been rebranded to EQTY after the Base migration.
 */
@Injectable()
export class CoinmarketcapService implements OnModuleInit {
	private readonly logger = new Logger(CoinmarketcapService.name);
	private latestPriceARBUSD: number;
	private latestPriceEQTYUSD: number; // Fetched via 'LTO' symbol from CMC API
	private previousPriceARBUSD: number;
	private previousPriceEQTYUSD: number;
	private latestApiCall: number;
	private apiCallIntervalSec: number;
	private templateCostsUSD_mainnet: number;
	private templateCostsUSD_testnet: number;
	private initialized: boolean;

	constructor(
		private readonly config: ConfigService,
		private readonly queue: QueueService,
		private readonly telegramService: TelegramBotService,
	) {
		if (!this.initialized) {
			this.initialized = true;
			this.latestPriceARBUSD = 0;
			this.latestPriceEQTYUSD = 0;
			this.previousPriceARBUSD = 0;
			this.previousPriceEQTYUSD = 0;
			this.apiCallIntervalSec = 3600; // 1h in seconds
			this.latestApiCall = 0;
			this.templateCostsUSD_mainnet = 0.15;
			this.templateCostsUSD_testnet = 0.15;
		} else {
			this.logger.debug('Already initialized');
		}
	}

	async onModuleInit() {
		if (typeof this.config.get('eqty.templateCostsUSD.mainnet') !== 'undefined') {
			this.templateCostsUSD_mainnet = parseFloat(this.config.get('eqty.templateCostsUSD.mainnet'));
			this.logger.debug(`templateCostsUSD_mainnet: ${this.templateCostsUSD_mainnet}`);
		}
		if (typeof this.config.get('eqty.templateCostsUSD.testnet') !== 'undefined') {
			this.templateCostsUSD_testnet = parseFloat(this.config.get('eqty.templateCostsUSD.testnet'));
			this.logger.debug(`templateCostsUSD_testnet: ${this.templateCostsUSD_testnet}`);
		}
		if (this.latestApiCall == 0) {
			await this.getLatestPrice();
		}
	}

	public async getLatestPrice() {
		const timeNow = Math.floor(Date.now() / 1000);
		if (timeNow > this.latestApiCall + this.apiCallIntervalSec) {
			this.latestApiCall = timeNow;
			this.logger.debug(`latestApiCall: ${this.latestApiCall}`);

			const url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest";

			try {
				const response = await axios.get(url, {
					headers: {
						"X-CMC_PRO_API_KEY": this.config.get('coinmarketcap'),
					},
					params: {
						// Note: CMC still uses 'LTO' symbol even after EQTY rebrand
						symbol: "LTO,ARB",
						convert: "USD",
					},
				});

				const data = response.data.data;

				let prevPrice_mainnet = 0;
				let prevPrice_testnet = 0;
				if (this.previousPriceEQTYUSD > 0) {
					prevPrice_mainnet = Math.floor((1 / this.previousPriceEQTYUSD) * this.templateCostsUSD_mainnet * 100000000);
					prevPrice_testnet = Math.floor((1 / this.previousPriceEQTYUSD) * this.templateCostsUSD_testnet * 100000000);
				}


				this.previousPriceARBUSD = this.latestPriceARBUSD;
				this.previousPriceEQTYUSD = this.latestPriceEQTYUSD;

				this.latestPriceARBUSD = parseFloat(data.ARB.quote.USD.price.toFixed(8));
				// LTO symbol on CMC = EQTY token after rebrand
				this.latestPriceEQTYUSD = parseFloat(data.LTO.quote.USD.price.toFixed(8));

				let newPrice_mainnet = 20000000;
				let newPrice_testnet = 20000000;
				if (this.latestPriceEQTYUSD > 0) {
					newPrice_mainnet = Math.floor((1 / this.latestPriceEQTYUSD) * this.templateCostsUSD_mainnet * 100000000);
					newPrice_testnet = Math.floor((1 / this.latestPriceEQTYUSD) * this.templateCostsUSD_testnet * 100000000);
				}
				this.logger.debug(`EQTY price (via LTO symbol): $${this.latestPriceEQTYUSD}`);
				this.logger.debug(`newPrice_testnet: ${newPrice_testnet}`);
				// Pass validated whole numbers to setTemplateCosts
				// Note: Using 'L'/'T' internally for queue storage compatibility
				await this.queue.setTemplateCosts('L', 'arbitrum', "1", newPrice_mainnet, prevPrice_mainnet, this.templateCostsUSD_mainnet);
				await this.queue.setTemplateCosts('T', 'arbitrum', "1", newPrice_testnet, prevPrice_testnet, this.templateCostsUSD_testnet);

			} catch (error) {
				this.telegramService.sendMessageToTelegramBot('L', `Error fetching data from CoinMarketCap: ${error.message}`);
			}
		}
	}
}