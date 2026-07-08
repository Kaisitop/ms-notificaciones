import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { envs } from '../config';
import * as OneSignal from '@onesignal/node-onesignal';

export type WebPushPayload = {
  alertaId?: string;
  url?: string;
};

@Injectable()
export class OnesignalService implements OnModuleInit {
  private readonly logger = new Logger(OnesignalService.name);
  private client: OneSignal.DefaultApi;
  private appId: string;
  private isConfigured = false;

  onModuleInit() {
    this.appId = envs.onesignalAppId;
    const restApiKey = envs.onesignalRestApiKey;

    if (this.appId && restApiKey) {
      const configuration = OneSignal.createConfiguration({
        restApiKey: restApiKey,
      });
      this.client = new OneSignal.DefaultApi(configuration);
      this.isConfigured = true;
      this.logger.log('OneSignal Configurado (Modo Producción)');
    } else {
      this.logger.warn('Faltan ONESIGNAL_APP_ID o ONESIGNAL_REST_API_KEY. Modo SIMULACIÓN para Web.');
    }
  }

  async sendWebPush(
    usuarioIds: string[],
    titulo: string,
    mensaje: string,
    payload?: WebPushPayload,
  ): Promise<boolean> {
    const uniqueIds = [...new Set(usuarioIds.filter(Boolean))];
    if (uniqueIds.length === 0) return false;

    if (!this.isConfigured) {
      this.logger.log(
        `[SIMULACIÓN OneSignal] Web Push a [${uniqueIds.join(', ')}] -> ${titulo}: ${mensaje}`,
      );
      return true;
    }

    try {
      const notification = new OneSignal.Notification();
      notification.app_id = this.appId;
      notification.include_aliases = { external_id: uniqueIds };
      notification.target_channel = 'push';
      notification.headings = { en: titulo, es: titulo };
      notification.contents = { en: mensaje, es: mensaje };

      if (payload?.url) {
        notification.url = payload.url;
      }

      if (payload?.alertaId) {
        notification.data = {
          alertaId: payload.alertaId,
          url: payload.url ?? `${envs.dashboardUrl}/alertas`,
        };
      }

      this.logger.log(
        `OneSignal web push → external_id=[${uniqueIds.join(', ')}] ` +
          `titulo="${titulo}"`,
      );

      const response = await this.client.createNotification(notification);

      const notificationId = response?.id?.trim?.() ?? '';
      const errors = this.extractErrors(response);
      const invalidAliases = this.extractInvalidAliases(response);

      if (!notificationId) {
        this.logger.warn(
          `OneSignal no creó la notificación (sin id). ` +
            `Destinatarios: [${uniqueIds.join(', ')}]. ` +
            (errors.length > 0
              ? `Errores: ${errors.join(' | ')}`
              : 'Ningún navegador suscrito con ese external_id.'),
        );
        return false;
      }

      if (invalidAliases.length > 0) {
        this.logger.warn(
          `OneSignal id=${notificationId} pero aliases inválidos / sin suscripción: ` +
            `${invalidAliases.join(' | ')}. ` +
            `En el panel: inicia sesión → Activar alertas push. ` +
            `El external_id debe ser el UUID del usuario.`,
        );
        return false;
      }

      if (errors.length > 0) {
        this.logger.warn(
          `OneSignal id=${notificationId} con avisos: ${errors.join(' | ')}`,
        );
      }

      this.logger.log(
        `OneSignal enviado con éxito: ${notificationId} ` +
          `(destinatarios solicitados: ${uniqueIds.length})`,
      );
      return true;
    } catch (error) {
      const message = error?.message ?? String(error);
      const body =
        typeof error?.body === 'string'
          ? error.body
          : error?.body
            ? JSON.stringify(error.body)
            : '';
      this.logger.error(
        `Error enviando OneSignal Web Push: ${message}` +
          (body ? ` | body: ${body}` : ''),
      );
      return false;
    }
  }

  private extractErrors(response: unknown): string[] {
    if (!response || typeof response !== 'object') return [];
    const errors = (response as { errors?: unknown }).errors;
    if (!errors) return [];
    if (Array.isArray(errors)) {
      return errors.map((e) =>
        typeof e === 'string' ? e : JSON.stringify(e),
      );
    }
    if (typeof errors === 'string') return [errors];
    return [JSON.stringify(errors)];
  }

  private extractInvalidAliases(response: unknown): string[] {
    if (!response || typeof response !== 'object') return [];
    const errors = (response as { errors?: unknown }).errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) {
      return [];
    }

    const aliasErrors = errors as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(aliasErrors)) {
      parts.push(`${key}=${JSON.stringify(value)}`);
    }
    return parts;
  }
}
