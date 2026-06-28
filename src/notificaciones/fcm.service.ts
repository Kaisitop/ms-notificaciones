import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';
import { envs } from '../config';

export interface FcmSendResult {
  success: boolean;
  invalidToken: boolean;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private isInitialized = false;

  onModuleInit() {
    const serviceAccountPath = envs.firebaseServiceAccountPath;

    try {
      const absolutePath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.resolve(process.cwd(), serviceAccountPath);

      if (
        serviceAccountPath &&
        serviceAccountPath !== './firebase-key.json' &&
        fs.existsSync(absolutePath)
      ) {
        const serviceAccount = JSON.parse(
          fs.readFileSync(absolutePath, 'utf8'),
        ) as ServiceAccount;

        if (getApps().length === 0) {
          initializeApp({
            credential: cert(serviceAccount),
          });
        }

        this.isInitialized = true;
        this.logger.log('FCM inicializado correctamente.');
      } else {
        this.logger.warn(
          'FCM no configurado (falta FIREBASE_SERVICE_ACCOUNT_PATH válido). Modo SIMULACIÓN.',
        );
      }
    } catch (e) {
      this.logger.error(`Error inicializando Firebase Admin: ${e.message}`);
    }
  }

  async sendPush(
    fcmToken: string,
    titulo: string,
    cuerpo: string,
    data?: Record<string, string>,
  ): Promise<FcmSendResult> {
    if (!this.isInitialized) {
      this.logger.log(
        `[SIMULACIÓN FCM] Push a Token ${fcmToken || 'N/A'} -> ${titulo}: ${cuerpo}`,
      );
      return { success: true, invalidToken: false };
    }

    try {
      await getMessaging().send({
        token: fcmToken,
        notification: { title: titulo, body: cuerpo },
        data: data || {},
      });
      return { success: true, invalidToken: false };
    } catch (error) {
      const code = error?.code || '';
      const invalidToken =
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token';

      this.logger.error(
        `Error enviando push FCM a ${fcmToken}: ${error.message}`,
      );
      return { success: false, invalidToken };
    }
  }
}
