import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { envs } from '../config';
import { TelegramService } from './telegram.service';
import { FcmService } from './fcm.service';
import { OnesignalService } from './onesignal.service';
import {
  buildFcmDataPayload,
  buildNotificationBody,
  buildNotificationPayload,
  buildNotificationTitle,
} from './notification-payload.util';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @Inject('NATS_SERVICE') private readonly natsClient: ClientProxy,
    private readonly telegramService: TelegramService,
    private readonly fcmService: FcmService,
    private readonly onesignalService: OnesignalService,
  ) {}

  async processAlerta(alerta: any) {
    this.logger.log(`Procesando alerta ${alerta.codigo} para zona ${alerta.zonaId}`);

    const alertaUrl = alerta.id
      ? `${envs.dashboardUrl}/alertas?alerta=${alerta.id}`
      : `${envs.dashboardUrl}/alertas`;

    let zonaNombre: string | null = null;
    if (alerta.zonaId) {
      try {
        const zona = await lastValueFrom(
          this.natsClient.send('zonas.findOne', alerta.zonaId),
        );
        zonaNombre = zona?.nombre ?? null;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar zona ${alerta.zonaId}: ${error.message}`,
        );
      }
    }

    const alertaForPayload = {
      tipo: alerta.tipo,
      descripcion: alerta.descripcion,
      zona: zonaNombre ? { nombre: zonaNombre } : null,
    };

    const titulo = buildNotificationTitle(alertaForPayload);
    const cuerpo = buildNotificationBody(alertaForPayload);

    const records: any[] = [];

    // ── 1. Ciudadanos con zona principal o suscripción en la zona de la alerta → FCM ──
    if (alerta.zonaId) {
      let usuarios: any[] = [];
      try {
        const result$ = this.natsClient.send(
          'usuario_zonas.get_users_by_zona',
          alerta.zonaId,
        );
        usuarios = await lastValueFrom(result$);
      } catch (error) {
        this.logger.error(
          `Error obteniendo usuarios de la zona ${alerta.zonaId}: ${error.message}`,
        );
      }

      if (usuarios?.length > 0) {
        let rolesMapping: { usuarioId: string; rol: string }[] = [];
        try {
          const userIds = usuarios.map((u) => u.usuarioId);
          rolesMapping = await lastValueFrom(
            this.natsClient.send('usuarios.get_roles', userIds),
          );
        } catch (error) {
          this.logger.error(`Error obteniendo roles de ms-auth: ${error.message}`);
        }

        const mapRoles = new Map(
          rolesMapping.map((r) => [r.usuarioId, r.rol]),
        );

        const ciudadanoIds = usuarios
          .filter((u) => mapRoles.get(u.usuarioId) === 'ciudadano')
          .map((u) => u.usuarioId);

        let fcmTokens: { usuarioId: string; fcmToken: string }[] = [];
        if (ciudadanoIds.length > 0) {
          try {
            fcmTokens = await lastValueFrom(
              this.natsClient.send(
                'dispositivos.get_fcm_tokens_by_users',
                ciudadanoIds,
              ),
            );
          } catch (error) {
            this.logger.error(
              `Error obteniendo tokens FCM de ms-auth: ${error.message}`,
            );
          }
        }

        if (fcmTokens.length === 0) {
          this.logger.warn(
            `No hay tokens FCM activos para ciudadanos de la zona ${alerta.zonaId}.`,
          );
        }

        for (const { usuarioId, fcmToken } of fcmTokens) {
          const notificationId = randomUUID();
          const createdAt = new Date();
          const payload = buildNotificationPayload({
            id: notificationId,
            alertaId: alerta.id,
            createdAt,
            leida: false,
            alerta: alertaForPayload,
          });

          const result = await this.fcmService.sendPush(
            fcmToken,
            payload.title,
            payload.body,
            buildFcmDataPayload(payload),
          );

          if (!result.success && result.invalidToken) {
            try {
              await lastValueFrom(
                this.natsClient.send('dispositivos.deactivate_fcm_token', {
                  fcmToken,
                }),
              );
              this.logger.warn(`Token FCM desactivado: ${fcmToken}`);
            } catch (error) {
              this.logger.error(
                `Error desactivando token FCM ${fcmToken}: ${error.message}`,
              );
            }
          }

          records.push({
            id: notificationId,
            alertaId: alerta.id,
            canal: 'fcm',
            destinatarioId: usuarioId,
            titulo,
            cuerpo,
            estado: result.success ? 'enviada' : 'fallida',
            intentos: 1,
            proveedorMsgId: result.success ? fcmToken.slice(0, 32) : null,
            errorDetalle: result.success ? null : 'FCM rechazó el token',
            leida: false,
            enviadaEn: result.success ? new Date() : null,
            createdAt,
          });
        }
      }
    }

    // ── 2. Panel web (Admin / Operador / Policia) → OneSignal ──
    let webRecipients: { usuarioId: string; rol: string }[] = [];
    try {
      webRecipients = await lastValueFrom(
        this.natsClient.send('usuarios.get_web_push_recipients', {}),
      );
    } catch (error) {
      this.logger.error(`Error obteniendo destinatarios web push: ${error.message}`);
    }

    const webIds = webRecipients.map((r) => r.usuarioId);
    if (webIds.length > 0) {
      const success = await this.onesignalService.sendWebPush(
        webIds,
        titulo,
        cuerpo,
        { alertaId: alerta.id, url: alertaUrl },
      );

      for (const opId of webIds) {
        records.push({
          alertaId: alerta.id,
          canal: 'onesignal',
          destinatarioId: opId,
          titulo,
          cuerpo,
          estado: success ? 'enviada' : 'fallida',
          intentos: 1,
          proveedorMsgId: success ? 'sim_msg_id' : null,
        });
      }
    } else {
      this.logger.warn('No hay usuarios del panel registrados para OneSignal web push.');
    }

    // ── 3. Telegram patrulla ──
    if (alerta.tipo === 'audio_ia' || alerta.generadaPor === 'yamnet_auto') {
      await this.telegramService.sendAlert(
        `DISPARO / GRITO CONFIRMADO — ${alerta.codigo}`,
        `Descripción: ${alerta.descripcion || alerta.tipo}\nSeveridad: ${alerta.severidad}\nZona: ${alerta.zonaId || 'N/A'}`,
        alerta.id,
      );
    } else {
      await this.telegramService.sendAlert(
        `ALERTA GENERAL — ${alerta.codigo}`,
        `Descripción: ${alerta.descripcion || alerta.tipo}\nSeveridad: ${alerta.severidad}`,
        alerta.id,
      );
    }

    if (records.length > 0) {
      try {
        await lastValueFrom(
          this.natsClient.send('notificaciones.create', records),
        );
        this.logger.log(`Historial de ${records.length} notificaciones enviado a ms-core.`);
      } catch (e) {
        this.logger.error(`Error enviando registros de notificaciones a ms-core: ${e.message}`);
      }
    }
  }
}
