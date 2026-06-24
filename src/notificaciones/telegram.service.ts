import { Injectable, Logger } from '@nestjs/common';
import { envs } from '../config';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string; // En una versión avanzada, cada usuario tendría su propio chat_id guardado en DB.

  constructor() {
    this.botToken = envs.telegramBotToken;
    this.chatId = envs.telegramChatId;
    
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN no configurado. Se ejecutará en modo SIMULACIÓN.');
    }
  }

  async sendAlert(titulo: string, mensaje: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      // Modo simulación
      this.logger.log(`[SIMULACIÓN TELEGRAM] A ChatID ${this.chatId || 'N/A'} -> ${titulo}: ${mensaje}`);
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await axios.post(url, {
        chat_id: this.chatId,
        text: `🚨 *${titulo}*\n\n${mensaje}`,
        parse_mode: 'Markdown',
      });
      return true;
    } catch (error) {
      this.logger.error(`Error enviando a Telegram: ${error.message}`);
      return false;
    }
  }
}
