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

type NearestPatrullero = {
  usuarioId: string;
  nombre: string | null;
  distanciaM: number;
};

function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @Inject('NATS_SERVICE') private readonly natsClient: ClientProxy,
    private readonly telegramService: TelegramService,
    private readonly fcmService: FcmService,
    private readonly onesignalService: OnesignalService,
  ) {}

  private async findNearestPatrulleroForAlerta(
    alertaId: string,
  ): Promise<NearestPatrullero | null> {
    try {
      const detail = await lastValueFrom(
        this.natsClient.send('alertas.findOne', { id: alertaId }),
      );
      if (detail?.latitud == null || detail?.longitud == null) {
        this.logger.warn(
          `Alerta ${alertaId} sin coordenadas — no se puede calcular patrullero cercano.`,
        );
        return null;
      }

      const nearest = await lastValueFrom(
        this.natsClient.send('patrullaje.findNearest', {
          latitud: Number(detail.latitud),
          longitud: Number(detail.longitud),
          maxAgeSec: 180,
        }),
      );

      if (!nearest?.usuarioId) {
        this.logger.warn(
          `Sin patrulleros activos con GPS reciente para alerta ${alertaId}.`,
        );
        return null;
      }

      return {
        usuarioId: nearest.usuarioId,
        nombre: nearest.nombre ?? null,
        distanciaM: Number(nearest.distanciaM ?? 0),
      };
    } catch (error) {
      this.logger.error(
        `Error buscando patrullero cercano para alerta ${alertaId}: ${error.message}`,
      );
      return null;
    }
  }

  async processAlerta(alerta: any) {
    this.logger.log(`Procesando alerta ${alerta.codigo} para zona ${alerta.zonaId}`);

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

    const panelUrl = envs.dashboardUrl.replace(/\/$/, '');
    const alertaUrlOperador = alerta.id
      ? `${panelUrl}/alertas?alerta=${alerta.id}`
      : `${panelUrl}/alertas`;
    const alertaUrlPolicia = alerta.id
      ? `${panelUrl}/patrullaje?alerta=${alerta.id}`
      : `${panelUrl}/patrullaje`;

    const operadorIds = webRecipients
      .filter((r) => r.rol === 'admin' || r.rol === 'operador')
      .map((r) => r.usuarioId);
    const policiaIds = webRecipients
      .filter((r) => r.rol === 'policia')
      .map((r) => r.usuarioId);

    const nearestPatrullero = alerta.id
      ? await this.findNearestPatrulleroForAlerta(alerta.id)
      : null;

    if (operadorIds.length > 0) {
      const success = await this.onesignalService.sendWebPush(
        operadorIds,
        titulo,
        cuerpo,
        { alertaId: alerta.id, url: alertaUrlOperador },
      );

      for (const opId of operadorIds) {
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
    }

    const policiaTargetIds = nearestPatrullero
      ? [nearestPatrullero.usuarioId]
      : policiaIds;

    const distLabel = nearestPatrullero
      ? formatDistanceMeters(nearestPatrullero.distanciaM)
      : null;
    const policiaTitulo = nearestPatrullero
      ? `Alerta cercana — ${alerta.codigo}`
      : titulo;
    const policiaCuerpo = nearestPatrullero
      ? `${cuerpo} Te encuentras a ~${distLabel}. Se te asigna respuesta prioritaria.`
      : cuerpo;

    if (policiaTargetIds.length > 0) {
      const success = await this.onesignalService.sendWebPush(
        policiaTargetIds,
        policiaTitulo,
        policiaCuerpo,
        { alertaId: alerta.id, url: alertaUrlPolicia },
      );

      for (const opId of policiaTargetIds) {
        records.push({
          alertaId: alerta.id,
          canal: 'onesignal',
          destinatarioId: opId,
          titulo: policiaTitulo,
          cuerpo: policiaCuerpo,
          estado: success ? 'enviada' : 'fallida',
          intentos: 1,
          proveedorMsgId: success ? 'sim_msg_id' : null,
        });
      }

      if (nearestPatrullero) {
        this.logger.log(
          `Push prioritario al patrullero más cercano: ${nearestPatrullero.usuarioId} (${nearestPatrullero.nombre ?? 'sin nombre'}) — ${distLabel}`,
        );
      }
    }

    if (operadorIds.length === 0 && policiaTargetIds.length === 0) {
      this.logger.warn('No hay usuarios del panel registrados para OneSignal web push.');
    }

    // ── 3. Telegram: grupo operadores/policía + canal ciudadanos ──
    const zonaLabel = zonaNombre || alerta.zonaId || 'Sin zona';
    const isCriticalIa =
      alerta.tipo === 'audio_ia' || alerta.generadaPor === 'yamnet_auto';

    const staffTitulo = isCriticalIa
      ? `DISPARO / GRITO CONFIRMADO — ${alerta.codigo}`
      : `ALERTA OPERATIVA — ${alerta.codigo}`;
    const staffMensaje = [
      `Tipo: ${alerta.tipo}`,
      `Descripción: ${alerta.descripcion || 'N/A'}`,
      `Severidad: ${alerta.severidad}`,
      `Zona: ${zonaLabel}`,
      nearestPatrullero
        ? `Patrullero más cercano: ${nearestPatrullero.nombre ?? nearestPatrullero.usuarioId} (~${formatDistanceMeters(nearestPatrullero.distanciaM)})`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    await this.telegramService.sendStaffAlert(
      staffTitulo,
      staffMensaje,
      alerta.id,
    );

    const citizenTitulo = isCriticalIa
      ? `Alerta de seguridad — ${zonaLabel}`
      : `Aviso en su sector — ${zonaLabel}`;
    const citizenMensaje = [
      `Se ha registrado un incidente en ${zonaLabel}.`,
      `Tipo: ${alerta.tipo}.`,
      alerta.descripcion ? `Detalle: ${alerta.descripcion}` : null,
      'Mantenga precaución y siga las indicaciones oficiales.',
    ]
      .filter(Boolean)
      .join('\n');

    await this.telegramService.sendCitizenAlert(citizenTitulo, citizenMensaje);

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
