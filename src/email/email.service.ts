import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { envs } from '../config';
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  EmailContent,
} from './email-templates.util';

export interface SendVerificationPayload {
  email: string;
  nombre?: string | null;
  token: string;
}

export interface SendPasswordResetPayload {
  email: string;
  nombre?: string | null;
  token: string;
  expiresInMinutes?: number;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;
  private readonly webUrl = envs.publicWebUrl.replace(/\/$/, '');

  async onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: envs.smtpHost,
      port: envs.smtpPort,
      secure: envs.smtpSecure,
      auth: {
        user: envs.smtpUser,
        pass: envs.smtpPass,
      },
    });

    try {
      await this.transporter.verify();
      this.logger.log(
        `SMTP listo (${envs.smtpHost}:${envs.smtpPort}, secure=${envs.smtpSecure}).`,
      );
    } catch (error) {
      throw new Error(
        `No se pudo conectar al servidor SMTP (${envs.smtpHost}:${envs.smtpPort}): ${(error as Error).message}`,
      );
    }
  }

  async sendVerificationEmail(payload: SendVerificationPayload): Promise<boolean> {
    const verifyUrl = `${this.webUrl}/verify-email?token=${encodeURIComponent(payload.token)}`;
    const content = buildVerificationEmail({ nombre: payload.nombre, verifyUrl });
    return this.deliver(payload.email, content);
  }

  async sendPasswordResetEmail(payload: SendPasswordResetPayload): Promise<boolean> {
    const encodedToken = encodeURIComponent(payload.token);
    const appResetUrl = `${envs.appResetUrl}?token=${encodedToken}`;
    const androidIntentUrl =
      `intent://reset-password?token=${encodedToken}` +
      `#Intent;scheme=centinela;package=${envs.androidAppPackage};end`;
    const webBase = this.webUrl.toLowerCase();
    const includeWebLink =
      !webBase.includes('localhost') && !webBase.includes('127.0.0.1');
    const webResetUrl = includeWebLink
      ? `${this.webUrl}/reset-password?token=${encodedToken}`
      : undefined;
    this.logger.log(
      `Reset email → app: ${envs.appResetUrl}?token=…` +
        (webResetUrl ? ` | web: ${webResetUrl}` : ' | web: omitido (localhost)'),
    );
    const content = buildPasswordResetEmail({
      nombre: payload.nombre,
      appResetUrl,
      androidIntentUrl,
      webResetUrl,
      token: payload.token,
      expiresInMinutes: payload.expiresInMinutes ?? 60,
    });
    return this.deliver(payload.email, content);
  }

  private formatSendError(error: unknown): string {
    const message = (error as Error).message ?? String(error);
    if (message.includes('Sending from domain') && message.includes('is not allowed')) {
      return (
        `${message} — Verifica el dominio en Mailtrap (Setup Sending → unemi.edu.ec → DNS) ` +
        `y usa MAIL_FROM con una dirección @unemi.edu.ec autorizada.`
      );
    }
    return message;
  }

  private async deliver(to: string, content: EmailContent): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: envs.mailFrom,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      this.logger.log(`Correo "${content.subject}" enviado a ${to} (desde ${envs.mailFrom}).`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error enviando correo a ${to} desde ${envs.mailFrom}: ${this.formatSendError(error)}`,
      );
      return false;
    }
  }
}
