import { Injectable, Logger } from '@nestjs/common';
import { envs } from '../config';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly dashboardUrl: string;

  constructor() {
    this.botToken = envs.telegramBotToken;
    this.chatId = envs.telegramChatId;
    this.dashboardUrl = envs.dashboardUrl.replace(/\/$/, '');

    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN no configurado. Se ejecutará en modo SIMULACIÓN.');
    }
  }

  async sendAlert(titulo: string, mensaje: string, alertaId?: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.log(
        `[SIMULACIÓN TELEGRAM] A ChatID ${this.chatId || 'N/A'} -> ${titulo}: ${mensaje}`,
      );
      if (alertaId) {
        this.logger.log(`[SIMULACIÓN] Botón mapa: ${this.dashboardUrl}/patrullaje?alerta=${alertaId}`);
      }
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload: Record<string, unknown> = {
        chat_id: this.chatId,
        text: `🚨 *${this.escapeMarkdown(titulo)}*\n\n${this.escapeMarkdown(mensaje)}`,
        parse_mode: 'MarkdownV2',
      };

      if (alertaId) {
        payload.reply_markup = {
          inline_keyboard: [
            [
              {
                text: '📍 Abrir Mapa / Atender Alerta',
                url: `${this.dashboardUrl}/patrullaje?alerta=${alertaId}`,
              },
            ],
          ],
        };
      }

      await axios.post(url, payload);
      return true;
    } catch (error) {
      this.logger.error(`Error enviando a Telegram: ${error.message}`);
      return false;
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}
