import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from './email.service';
import type {
  SendPasswordResetPayload,
  SendVerificationPayload,
} from './email.service';

@Controller()
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  @EventPattern('email.send_verification')
  async handleSendVerification(@Payload() payload: SendVerificationPayload) {
    this.logger.log(`Solicitud de email de verificación para ${payload.email}`);
    await this.emailService.sendVerificationEmail(payload);
  }

  @EventPattern('email.send_password_reset')
  async handleSendPasswordReset(@Payload() payload: SendPasswordResetPayload) {
    this.logger.log(`Solicitud de email de reset de contraseña para ${payload.email}`);
    await this.emailService.sendPasswordResetEmail(payload);
  }
}
