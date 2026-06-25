import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { envs } from '../config';
import { TelegramService } from './telegram.service';
import { FcmService } from './fcm.service';
import { OnesignalService } from './onesignal.service';

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

    const titulo = `Alerta Centinela — ${alerta.codigo}`;
    const cuerpo =
      alerta.descripcion ||
      `Nueva alerta ${alerta.tipo}. Severidad ${alerta.severidad}.`;

    const alertaUrl = alerta.id
      ? `${envs.dashboardUrl}/alertas?alerta=${alerta.id}`
      : `${envs.dashboardUrl}/alertas`;

    const records: any[] = [];

    // ── 1. Ciudadanos suscritos a la zona → FCM ──
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

        for (const u of usuarios) {
          if (mapRoles.get(u.usuarioId) !== 'ciudadano') continue;

          const fcmTokenFake = `device_token_${u.usuarioId.split('-')[0]}`;
          const success = await this.fcmService.sendPush(
            fcmTokenFake,
            titulo,
            cuerpo,
            { alertaId: alerta.id },
          );

          records.push({
            alertaId: alerta.id,
            canal: 'fcm',
            destinatarioId: u.usuarioId,
            titulo,
            cuerpo,
            estado: success ? 'enviada' : 'fallida',
            intentos: 1,
            proveedorMsgId: success ? 'sim_msg_id' : null,
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
        this.natsClient.emit('notificaciones.create', records);
        this.logger.log(`Historial de ${records.length} notificaciones enviado a ms-core.`);
      } catch (e) {
        this.logger.error(`Error enviando registros de notificaciones a ms-core: ${e.message}`);
      }
    }
  }
}
