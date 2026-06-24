import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  NATS_SERVICE: string;
  FIREBASE_SERVICE_ACCOUNT_PATH: string;
  ONESIGNAL_APP_ID: string;
  ONESIGNAL_REST_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

const envsSchema = joi.object({
  NATS_SERVICE: joi.string().required(),
  FIREBASE_SERVICE_ACCOUNT_PATH: joi.string().default('./firebase-key.json'),
  ONESIGNAL_APP_ID: joi.string().allow('').optional(),
  ONESIGNAL_REST_API_KEY: joi.string().allow('').optional(),
  TELEGRAM_BOT_TOKEN: joi.string().allow('').optional(),
  TELEGRAM_CHAT_ID: joi.string().allow('').optional(),
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
};
