import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';

import { envs } from './config';

async function bootstrap() {
  const logger = new Logger('NotificacionesBootstrap');
  
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.NATS,
      options: {
        servers: [envs.natsServer],
      },
    },
  );

  await app.listen();
  logger.log(`Microservicio de Notificaciones escuchando en NATS`);
}
bootstrap();
