import { Injectable, Logger } from '@nestjs/common';
import { envs } from '../config';
import axios from 'axios';

export type TelegramDestination = 'staff' | 'citizens';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly staffGroupId: string;
  private readonly citizenChannelId: string;
  private readonly dashboardUrl: string;

  constructor() {
    this.botToken = envs.telegramBotToken;
    this.staffGroupId =
      envs.telegramStaffGroupId || envs.telegramChatId || '';
    this.citizenChannelId = envs.telegramCitizenChannelId || '';
    this.dashboardUrl = envs.dashboardUrl.replace(/\/$/, '');

    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN no configurado. Modo SIMULACIÓN.');
    }
    if (!this.staffGroupId) {
      this.logger.warn(
        'TELEGRAM_STAFF_GROUP_ID no configurado (grupo operadores/policía).',
      );
    }
    if (!this.citizenChannelId) {
      this.logger.warn(
        'TELEGRAM_CITIZEN_CHANNEL_ID no configurado (canal ciudadanos).',
      );
    }
  }

  /** Grupo operadores + patrulleros: mensaje operativo con enlace al panel. */
  async sendStaffAlert(
    titulo: string,
    mensaje: string,
    alertaId?: string,
  ): Promise<boolean> {
    const panelUrl = alertaId
      ? `${this.dashboardUrl}/patrullaje?alerta=${alertaId}`
      : undefined;
    const buttonUrl =
      panelUrl && this.isValidTelegramInlineUrl(panelUrl) ? panelUrl : undefined;
    const mensajeConEnlace =
      panelUrl && !buttonUrl
        ? `${mensaje}\n\nEnlace al panel: ${panelUrl}`
        : mensaje;

    return this.sendMessage({
      destination: 'staff',
      chatId: this.staffGroupId,
      titulo,
      mensaje: mensajeConEnlace,
      alertaId,
      buttonUrl,
      buttonText: '📍 Abrir mapa / Atender alerta',
    });
  }

  /** Canal público ciudadanos: aviso de precaución sin enlace al panel interno. */
  async sendCitizenAlert(titulo: string, mensaje: string): Promise<boolean> {
    return this.sendMessage({
      destination: 'citizens',
      chatId: this.citizenChannelId,
      titulo,
      mensaje,
    });
  }

  private async sendMessage(options: {
    destination: TelegramDestination;
    chatId: string;
    titulo: string;
    mensaje: string;
    alertaId?: string;
    buttonUrl?: string;
    buttonText?: string;
  }): Promise<boolean> {
    const { destination, chatId, titulo, mensaje, alertaId, buttonUrl, buttonText } =
      options;

    if (!this.botToken || !chatId) {
      this.logger.log(
        `[SIMULACIÓN TELEGRAM:${destination}] chat=${chatId || 'N/A'} -> ${titulo}: ${mensaje}`,
      );
      if (buttonUrl) {
        this.logger.log(`[SIMULACIÓN] Botón: ${buttonUrl}`);
      }
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text: `🚨 <b>${this.escapeHtml(titulo)}</b>\n\n${this.escapeHtml(mensaje)}`,
        parse_mode: 'HTML',
      };

      if (buttonUrl && buttonText) {
        payload.reply_markup = {
          inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
        };
      }

      await axios.post(url, payload);
      this.logger.log(`Telegram [${destination}] enviado: ${titulo}`);
      return true;
    } catch (error) {
      const detail = error?.response?.data?.description || error.message;

      if (buttonUrl && buttonText) {
        this.logger.warn(
          `Telegram [${destination}] falló con botón (${detail}); reintentando sin botón.`,
        );
        return this.sendMessage({ ...options, buttonUrl: undefined, buttonText: undefined });
      }

      this.logger.error(`Error Telegram [${destination}]: ${detail}`);
      return false;
    }
  }

  /** Telegram solo acepta URLs https públicas en botones inline (no localhost). */
  private isValidTelegramInlineUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
        return false;
      }
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
