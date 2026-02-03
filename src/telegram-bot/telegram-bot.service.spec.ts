import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigService } from '../config/config.service';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

import axios from 'axios';

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  let mockConfig: Partial<ConfigService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      load: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'telegramBot.token': 'test-bot-token',
          'telegramBot.channelId.mainnet': '-1001234567890',
          'telegramBot.channelId.testnet': '-1009876543210',
        };
        return config[key];
      }),
    };

    service = new TelegramBotService(mockConfig as ConfigService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should load config and set tokens', async () => {
      await service.onModuleInit();

      expect(mockConfig.load).toHaveBeenCalled();
      expect(mockConfig.get).toHaveBeenCalledWith('telegramBot.token');
      expect(mockConfig.get).toHaveBeenCalledWith('telegramBot.channelId.mainnet');
      expect(mockConfig.get).toHaveBeenCalledWith('telegramBot.channelId.testnet');
    });
  });

  describe('sendMessageToTelegramBot', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send message to mainnet channel', async () => {
      await service.sendMessageToTelegramBot('L', 'Test mainnet message');

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendMessage',
        {
          chat_id: '-1001234567890',
          text: 'Test mainnet message',
        }
      );
    });

    it('should send message to testnet channel', async () => {
      await service.sendMessageToTelegramBot('T', 'Test testnet message');

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendMessage',
        {
          chat_id: '-1009876543210',
          text: 'Test testnet message',
        }
      );
    });

    it('should use different channel ID for mainnet vs testnet', async () => {
      await service.sendMessageToTelegramBot('L', 'Mainnet');
      await service.sendMessageToTelegramBot('T', 'Testnet');

      expect(axios.post).toHaveBeenCalledTimes(2);

      const calls = (axios.post as any).mock.calls;
      expect(calls[0][1].chat_id).toBe('-1001234567890');
      expect(calls[1][1].chat_id).toBe('-1009876543210');
    });

    it('should handle API errors gracefully', async () => {
      (axios.post as any).mockRejectedValueOnce(new Error('API Error'));

      // Should not throw
      await expect(
        service.sendMessageToTelegramBot('L', 'Error test')
      ).resolves.not.toThrow();
    });

    it('should construct correct API URL with token', async () => {
      await service.sendMessageToTelegramBot('L', 'URL test');

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org/bottest-bot-token'),
        expect.any(Object)
      );
    });
  });
});
