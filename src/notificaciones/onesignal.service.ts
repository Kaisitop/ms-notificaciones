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
      this.logger.warn(
        'Faltan ONESIGNAL_APP_ID o ONESIGNAL_REST_API_KEY. Modo SIMULACIÓN para Web.',
      );
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

      const response = await this.client.createNotification(notification);
      this.logger.log(`OneSignal enviado con éxito: ${response.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error enviando OneSignal Web Push: ${error.message}`);
      return false;
    }
  }
}
