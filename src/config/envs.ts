import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  NATS_SERVICE: string;
  FIREBASE_SERVICE_ACCOUNT_PATH: string;
  ONESIGNAL_APP_ID: string;
  ONESIGNAL_REST_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  DASHBOARD_URL: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  MAIL_FROM: string;
  PUBLIC_WEB_URL: string;
}

const envsSchema = joi.object({
  NATS_SERVICE: joi.string().required(),
  FIREBASE_SERVICE_ACCOUNT_PATH: joi.string().default('./firebase-key.json'),
  ONESIGNAL_APP_ID: joi.string().allow('').optional(),
  ONESIGNAL_REST_API_KEY: joi.string().allow('').optional(),
  TELEGRAM_BOT_TOKEN: joi.string().allow('').optional(),
  TELEGRAM_CHAT_ID: joi.string().allow('').optional(),
  DASHBOARD_URL: joi.string().uri().allow('').default('http://localhost:3001'),
  SMTP_HOST: joi.string().required(),
  SMTP_PORT: joi.number().default(587),
  SMTP_SECURE: joi.boolean().default(false),
  SMTP_USER: joi.string().required(),
  SMTP_PASS: joi.string().required(),
  MAIL_FROM: joi.string().required(),
  PUBLIC_WEB_URL: joi.string().uri().optional(),
})
.unknown(true);

const { error, value } = envsSchema.validate(process.env);

if (error) {
  throw new Error(`Error en la configuracion de la validacion ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
  natsServer: envVars.NATS_SERVICE,
  firebaseServiceAccountPath: envVars.FIREBASE_SERVICE_ACCOUNT_PATH,
  onesignalAppId: envVars.ONESIGNAL_APP_ID,
  onesignalRestApiKey: envVars.ONESIGNAL_REST_API_KEY,
  telegramBotToken: envVars.TELEGRAM_BOT_TOKEN,
  telegramChatId: envVars.TELEGRAM_CHAT_ID,
  dashboardUrl: envVars.DASHBOARD_URL || 'http://localhost:3001',
  smtpHost: envVars.SMTP_HOST,
  smtpPort: envVars.SMTP_PORT,
  smtpSecure: envVars.SMTP_SECURE,
  smtpUser: envVars.SMTP_USER,
  smtpPass: envVars.SMTP_PASS,
  mailFrom: envVars.MAIL_FROM,
  publicWebUrl: envVars.PUBLIC_WEB_URL || envVars.DASHBOARD_URL || 'http://localhost:3001',
};
