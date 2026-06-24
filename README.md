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

## Levantar el servicio

```bash
npm run start:dev
```

## Modo Simulación vs Producción

El servicio está preparado para salir a producción. 

- Si proporcionas llaves válidas en `.env`, el código de `fcm.service.ts` y `telegram.service.ts` intentará despachar los mensajes usando las SDK oficiales (ej. `firebase-admin` o peticiones POST vía `axios`).
- Si las llaves están en blanco (como por defecto), el sistema asume un entorno de desarrollo/prototipo y mostrará algo como esto:

```bash
[NotificacionesBootstrap] Microservicio de Notificaciones escuchando en NATS
[NotificacionesController] Nueva alerta recibida vía NATS: 550e8400-e29b-41d4-a716-446655440000
[NotificacionesService] Procesando alerta ALRT-001 para zona xxxx...
[FcmService] [SIMULACIÓN FCM] Push a Token device_token_xxxxx -> ¡Alerta en tu zona!: Se ha detectado una anomalía...
[TelegramService] [SIMULACIÓN TELEGRAM] A ChatID N/A -> ALERTA GENERAL - ALRT-001...
[NotificacionesService] Historial de 1 notificaciones enviado a ms-core.
```
