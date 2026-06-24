import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
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

    if (!alerta.zonaId) {
      this.logger.warn('Alerta sin zonaId, no se puede notificar por zona.');
      return;
    }

    // 1. Obtener los destinatarios (ciudadanos suscritos a la zona)
    let usuarios: any[] = [];
    try {
      const result$ = this.natsClient.send('usuario_zonas.get_users_by_zona', alerta.zonaId);
      usuarios = await lastValueFrom(result$);
    } catch (error) {
      this.logger.error(`Error obteniendo usuarios de la zona ${alerta.zonaId}: ${error.message}`);
      return;
    }

    if (!usuarios || usuarios.length === 0) {
      this.logger.log(`No hay usuarios suscritos a la zona ${alerta.zonaId}`);
      return;
    }

    // 2. Obtener roles desde ms-auth
    let rolesMapping = [];
    try {
      const userIds = usuarios.map(u => u.usuarioId);
      const roles$ = this.natsClient.send('usuarios.get_roles', userIds);
      rolesMapping = await lastValueFrom(roles$);
    } catch (error) {
      this.logger.error(`Error obteniendo roles de ms-auth: ${error.message}`);
      return;
    }

    const mapRoles = new Map(rolesMapping.map((r: any) => [r.usuarioId, r.rol]));

    this.logger.log(`Procesando notificaciones para ${usuarios.length} usuarios.`);

    const titulo = `¡Alerta en tu zona!`;
    const cuerpo = `Se ha detectado una anomalía: ${alerta.descripcion || alerta.tipo}. Mantén la calma y toma precauciones.`;

    const records: any[] = [];
    const operadoresIds: string[] = [];

    // 3. Despachar notificaciones
    for (const u of usuarios) {
      const rol = mapRoles.get(u.usuarioId);

      if (rol === 'ciudadano') {
        // Enviar por FCM (App Móvil)
        const fcmTokenFake = `device_token_${u.usuarioId.split('-')[0]}`;
        const success = await this.fcmService.sendPush(fcmTokenFake, titulo, cuerpo, { alertaId: alerta.id });
        
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
      } else if (rol === 'operador' || rol === 'admin') {
        // Recolectar para enviar por OneSignal en batch
        operadoresIds.push(u.usuarioId);
      }
    }

    // Enviar batch de OneSignal
    if (operadoresIds.length > 0) {
      const success = await this.onesignalService.sendWebPush(operadoresIds, titulo, cuerpo);
      for (const opId of operadoresIds) {
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

    // Opcional: Avisar a un canal global de Telegram
    await this.telegramService.sendAlert(
      `ALERTA GENERAL - ${alerta.codigo}`, 
      `Descripción: ${alerta.descripcion || alerta.tipo}\nSeveridad: ${alerta.severidad}`
    );

    // 3. Guardar historial en la base de datos (ms-core)
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
