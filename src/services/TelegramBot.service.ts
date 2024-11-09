import { Injectable, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramService implements OnModuleInit {
    private telegramBotToken: string;
    private telegramBotChannelId: string;
    
    constructor(private readonly config: ConfigService) {
        // this.telegramBotToken = this.config.get('telegramBot.token');
        // this.telegramBotChannelId = this.config.get('telegramBot.channelId');
        this.telegramBotToken = this.config.get('TELEGRAM_BOT_TOKEN');
        this.telegramBotChannelId = this.config.get('TELEGRAM_CHANNEL_ID');
    }

    async onModuleInit() { 
        this.telegramBotToken = this.config.get('TELEGRAM_BOT_TOKEN');
        this.telegramBotChannelId = this.config.get('TELEGRAM_CHANNEL_ID');
    }

    public async sendMessageToTelegramBot(message: string) {
        // # Use curl to send a message
        const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`; // Replace with your API endpoint
        const data = {
          chat_id: `${this.telegramBotChannelId}`,
          text: `${message}`
        };
    
        await axios.post(url, data)
          .then(response => {
            console.log('Success:', response.data); // Handle the response data
          })
          .catch(error => {
            console.error('Error:', error); // Handle errors
          });    
      }
}