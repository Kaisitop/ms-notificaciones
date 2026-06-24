import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { envs } from '../config';
import * as OneSignal from '@onesignal/node-onesignal';

@Injectable()
export class OnesignalService implements OnModuleInit {
  private readonly logger = new Logger(OnesignalService.name);
  private client: OneSignal.DefaultApi;
  private appId: string;
  private isConfigured = false;

  constructor() {}

  onModuleInit() {
    this.appId = envs.onesignalAppId;
    const restApiKey = envs.onesignalRestApiKey;

    if (this.appId && restApiKey) {
      const configuration = OneSignal.createConfiguration({
        authMethods: {
          app_key: {
            tokenProvider: {
              getToken() {
                return restApiKey;
              }
            }
          }
        }
      });
      this.client = new OneSignal.DefaultApi(configuration);
      this.isConfigured = true;
      this.logger.log('OneSignal Configurado (Modo Producción)');
    } else {
      this.logger.warn('Faltan ONESIGNAL_APP_ID o ONESIGNAL_REST_API_KEY. Modo SIMULACIÓN para Web.');
    }
  }

  async sendWebPush(usuarioIds: string[], titulo: string, mensaje: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.log(`[SIMULACIÓN OneSignal] Web Push a [${usuarioIds.join(', ')}] -> ${titulo}: ${mensaje}`);
      return true;
    }

    try {
      const notification = new OneSignal.Notification();
      notification.app_id = this.appId;
      // Usamos include_external_user_ids para enviar a usuarios específicos del backend
      notification.include_external_user_ids = usuarioIds; 
      notification.headings = { en: titulo, es: titulo };
      notification.contents = { en: mensaje, es: mensaje };
      
      const response = await this.client.createNotification(notification);
      this.logger.log(`OneSignal enviado con éxito: ${response.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error enviando OneSignal Web Push: ${error.message}`);
      return false;
    }
  }
}
