import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { envs } from '../config';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private isInitialized = false;

  constructor() {}

  onModuleInit() {
    const serviceAccountPath = envs.firebaseServiceAccountPath;
    
    try {
      if (serviceAccountPath && serviceAccountPath !== './firebase-key.json' /* Default falso */) {
        // En una app real, aquí se inicializa Firebase Admin
        /*
        const serviceAccount = require(serviceAccountPath); // path absoluto
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        */
        this.logger.log('FCM Configurado en modo PRODUCCIÓN (esperando key válida). Por ahora simulado.');
      } else {
        this.logger.warn('FCM no configurado (falta FIREBASE_SERVICE_ACCOUNT_PATH real). Modo SIMULACIÓN.');
      }
    } catch (e) {
      this.logger.error(`Error inicializando Firebase Admin: ${e.message}`);
    }
  }

  async sendPush(fcmToken: string, titulo: string, cuerpo: string, data?: any): Promise<boolean> {
    if (!this.isInitialized) {
      this.logger.log(`[SIMULACIÓN FCM] Push a Token ${fcmToken || 'N/A'} -> ${titulo}: ${cuerpo}`);
      return true;
    }

    try {
      // Código real para enviar a FCM
      /*
      await admin.messaging().send({
        token: fcmToken,
        notification: { title: titulo, body: cuerpo },
        data: data || {},
      });
      */
      return true;
    } catch (error) {
      this.logger.error(`Error enviando push FCM a ${fcmToken}: ${error.message}`);
      return false;
    }
  }
}
