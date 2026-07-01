# ms-notificaciones

Microservicio encargado de enviar alertas y notificaciones a los ciudadanos y operadores del sistema CENTINELA (UNEMI).

Este servicio actúa como el eslabón final de la cadena de detección de eventos críticos. Recibe alertas generadas por `ms-core` (vía NATS), consulta qué ciudadanos deben ser notificados y realiza los envíos a proveedores externos (Firebase Cloud Messaging y Telegram).

## Arquitectura

```text
ms-core (Alerta detectada) 
   → NATS: alerta.created 
      → ms-notificaciones 
         1. NATS: usuario_zonas.get_users_by_zona (Busca destinatarios)
         2. NATS: usuarios.get_roles (Consulta a ms-auth los roles de los destinatarios)
         3. Envío según rol:
            - Si es 'ciudadano' -> Firebase Cloud Messaging (FCM / App Móvil)
            - Si es 'operador' o 'admin' -> OneSignal (Notificación Web)
         4. NATS: notificaciones.create (Guarda historial en BD)
```

**Nota sobre la Base de Datos:** `ms-notificaciones` no tiene conexión directa a la base de datos PostgreSQL por diseño. Todo el historial (`app.notificaciones`) y la consulta de usuarios (`app.usuario_zonas`) se delega al dueño del dominio (`ms-core`) mediante mensajes NATS.

## Requisitos

- Node.js v20+
- NATS corriendo en puerto 4222
- `ms-core` corriendo
- Firebase Admin SDK (Opcional para producción)

## Configuración

```bash
cd ms-notificaciones
npm install
copy .env.example .env
```

En el archivo `.env` puedes configurar los tokens reales. Si no los tienes, el servicio funcionará en **Modo Simulación**, imprimiendo los mensajes por consola.

## Variables de Entorno

- `NATS_SERVER`: URL del broker NATS (default: `nats://localhost:4222`).
- `FIREBASE_SERVICE_ACCOUNT_PATH`: Ruta al archivo JSON de credenciales de Firebase.
- `ONESIGNAL_APP_ID`: ID de la aplicación en OneSignal.
- `ONESIGNAL_REST_API_KEY`: API Key de OneSignal.
- `TELEGRAM_BOT_TOKEN`: Token de tu bot de Telegram.
- `TELEGRAM_CHAT_ID`: ID del chat/canal donde enviar avisos.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: Envío de correos transaccionales (verificación, recuperación de contraseña).
- `PUBLIC_WEB_URL`: URL base del frontend para enlaces en emails.

> **Fotos y evidencia:** las imágenes de reportes y alertas se gestionan en `c-gateway` (Cloudinary) y `ms-core` (URLs en BD). Este servicio no adjunta imágenes a push/email; solo notifica el evento de alerta.

## Levantar el servicio

```bash
npm run start:dev
```

## Modo Simulación vs Producción

- **Push (FCM) y Telegram:** si las llaves están en blanco, FCM/Telegram pueden operar en modo simulación (consola).
- **Email (SMTP):** es **obligatorio** en entornos con registro/verificación activos. Configura Gmail App Password u otro SMTP en `.env` (ver `.env.example`).

Ejemplo de log en desarrollo (push simulado):

```bash
[NotificacionesBootstrap] Microservicio de Notificaciones escuchando en NATS
[NotificacionesController] Nueva alerta recibida vía NATS: 550e8400-e29b-41d4-a716-446655440000
[NotificacionesService] Procesando alerta ALRT-001 para zona xxxx...
[FcmService] [SIMULACIÓN FCM] Push a Token device_token_xxxxx -> ¡Alerta en tu zona!: Se ha detectado una anomalía...
[TelegramService] [SIMULACIÓN TELEGRAM] A ChatID N/A -> ALERTA GENERAL - ALRT-001...
[NotificacionesService] Historial de 1 notificaciones enviado a ms-core.
```

## Email transaccional

Escucha eventos NATS (`email.send_verification`, `email.send_password_reset`, etc.) emitidos por `ms-auth` y envía HTML vía Nodemailer. Las variables SMTP se inyectan desde el `.env` raíz del monorepo en Docker Compose.
