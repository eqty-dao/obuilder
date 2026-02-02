import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '../config/config.service';
import axios from 'axios';

@Injectable()
export class TelegramBotService implements OnModuleInit {
    private readonly logger = new Logger(TelegramBotService.name);
    private telegramBotToken: string;
    private telegramBotChannelId_L: string;
    private telegramBotChannelId_T: string;

    constructor(private readonly config: ConfigService) {
    }

    async onModuleInit() {
        // Ensure config is loaded before accessing it
        await this.config.load();

        this.telegramBotToken = this.config.get('telegramBot.token');
        this.telegramBotChannelId_L = this.config.get('telegramBot.channelId.mainnet');
        this.telegramBotChannelId_T = this.config.get('telegramBot.channelId.testnet');
        this.logger.debug(`telegramBotChannelId_L: ${this.telegramBotChannelId_L}`);
        this.logger.debug(`telegramBotChannelId_T: ${this.telegramBotChannelId_T}`);
    }

    public async sendMessageToTelegramBot(ltoNetwork_id: 'L' | 'T', message: string) {
        // # Use curl to send a message
        const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`; // Replace with your API endpoint
        let data;
        if (ltoNetwork_id === 'L') {
            data = {
                chat_id: `${this.telegramBotChannelId_L}`,
                text: `${message}`
            };
        } else {
            data = {
                chat_id: `${this.telegramBotChannelId_T}`,
                text: `${message}`
            };
        }

        await axios.post(url, data)
            .then(response => {
                // console.log('Success:', response.data); // Handle the response data
            })
            .catch(error => {
                // console.error('Error:', error); // Handle errors
            });
    }
}
