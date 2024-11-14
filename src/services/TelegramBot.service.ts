import { Injectable, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramService implements OnModuleInit {
    private telegramBotToken: string;
    private telegramBotChannelIdMainnet: string;
    private telegramBotChannelIdTestnet: string;
    
    constructor(private readonly config: ConfigService) {
        // this.telegramBotToken = this.config.get('telegramBot.token');
        // this.telegramBotChannelId = this.config.get('telegramBot.channelId');
        this.telegramBotToken = this.config.get('TELEGRAM_BOT_TOKEN');
        this.telegramBotChannelIdMainnet = this.config.get('TELEGRAM_CHANNEL_ID_L');
        this.telegramBotChannelIdTestnet = this.config.get('TELEGRAM_CHANNEL_ID_T');
    }

    async onModuleInit() { 
        this.telegramBotToken = this.config.get('TELEGRAM_BOT_TOKEN');
        this.telegramBotChannelIdMainnet = this.config.get('TELEGRAM_CHANNEL_ID_L');
        this.telegramBotChannelIdTestnet = this.config.get('TELEGRAM_CHANNEL_ID_T');
    }

    public async sendMessageToTelegramBot(ltoNetwork_id: 'L'|'T', message: string) {
        // # Use curl to send a message
        const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`; // Replace with your API endpoint
        let data;
        if(ltoNetwork_id === 'L'){
          data = {
            chat_id: `${this.telegramBotChannelIdMainnet}`,
            text: `${message}`
          };
        }else{
          data = {
            chat_id: `${this.telegramBotChannelIdTestnet}`,
            text: `${message}`
          };
        }
    
        await axios.post(url, data)
          .then(response => {
            console.log('Success:', response.data); // Handle the response data
          })
          .catch(error => {
            console.error('Error:', error); // Handle errors
          });    
      }
}