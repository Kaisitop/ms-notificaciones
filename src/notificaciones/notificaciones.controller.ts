import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificacionesService } from './notificaciones.service';

@Controller()
export class NotificacionesController {
  private readonly logger = new Logger(NotificacionesController.name);

  constructor(private readonly notificacionesService: NotificacionesService) {}

  @EventPattern('alerta.created')
  async handleAlertaCreated(@Payload() alerta: any) {
    this.logger.log(`Nueva alerta recibida vía NATS: ${alerta.id}`);
    await this.notificacionesService.processAlerta(alerta);
  }
}
