import { NotificacionesController } from './notificaciones/notificaciones.controller';
import { NotificacionesService } from './notificaciones/notificaciones.service';
import { TelegramService } from './notificaciones/telegram.service';
import { FcmService } from './notificaciones/fcm.service';
import { OnesignalService } from './notificaciones/onesignal.service';
import { envs } from './config';

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'NATS_SERVICE',
        useFactory: () => ({
          transport: Transport.NATS,
          options: {
            servers: [envs.natsServer],
          },
        }),
      },
    ]),
  ],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, TelegramService, FcmService, OnesignalService],
})
export class AppModule {}
