export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Centinela';
const BRAND_COLOR = '#6366f1';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseLayout(options: {
  heading: string;
  greeting: string;
  intro: string;
  buttonLabel: string;
  buttonUrl: string;
  fallbackNote: string;
  footerNote: string;
}): string {
  const { heading, greeting, intro, buttonLabel, buttonUrl, fallbackNote, footerNote } = options;
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0f172a;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${BRAND}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;color:#f8fafc;font-size:22px;font-weight:700;">${escapeHtml(heading)}</h1>
                <p style="margin:0 0 8px;color:#cbd5e1;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background-color:${BRAND_COLOR};">
                      <a href="${buttonUrl}" target="_blank" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${escapeHtml(buttonLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 8px;color:#64748b;font-size:13px;line-height:1.6;">${escapeHtml(fallbackNote)}</p>
                <p style="margin:0;word-break:break-all;"><a href="${buttonUrl}" target="_blank" style="color:#818cf8;font-size:13px;">${escapeHtml(buttonUrl)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #334155;">
                <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${escapeHtml(footerNote)}</p>
                <p style="margin:8px 0 0;color:#475569;font-size:12px;">© ${new Date().getFullYear()} ${BRAND}. Todos los derechos reservados.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildVerificationEmail(params: {
  nombre?: string | null;
  verifyUrl: string;
}): EmailContent {
  const nombre = params.nombre?.trim() || 'usuario';
  const subject = 'Verifica tu correo — Centinela';
  const html = baseLayout({
    heading: 'Confirma tu correo electrónico',
    greeting: `Hola ${nombre},`,
    intro:
      'Gracias por registrarte en Centinela. Para activar tu cuenta y empezar a recibir alertas, confirma tu dirección de correo electrónico.',
    buttonLabel: 'Verificar mi correo',
    buttonUrl: params.verifyUrl,
    fallbackNote: 'Si el botón no funciona, copia y pega este enlace en tu navegador:',
    footerNote:
      'Si no creaste una cuenta en Centinela, puedes ignorar este mensaje de forma segura.',
  });
  const text = `Hola ${nombre},\n\nConfirma tu correo electrónico para activar tu cuenta en Centinela:\n${params.verifyUrl}\n\nSi no creaste una cuenta, ignora este mensaje.`;
  return { subject, html, text };
}

export function buildPasswordResetEmail(params: {
  nombre?: string | null;
  appResetUrl: string;
  androidIntentUrl: string;
  webResetUrl?: string;
  token: string;
  expiresInMinutes: number;
}): EmailContent {
  const nombre = params.nombre?.trim() || 'usuario';
  const subject = 'Restablece tu contraseña — Centinela';
  const html = baseLayout({
    heading: 'Restablece tu contraseña',
    greeting: `Hola ${nombre},`,
    intro:
      `Recibimos una solicitud para restablecer la contraseña de tu cuenta. ` +
      `Este enlace expira en ${params.expiresInMinutes} minutos. ` +
      `Abre el correo en el mismo teléfono donde tienes instalada la app Centinela.`,
    buttonLabel: 'Abrir en la app Centinela',
    buttonUrl: params.appResetUrl,
    fallbackNote:
      'Si el botón no abre la app, copia el token de abajo y en Centinela ve a ' +
      '"¿Olvidaste tu contraseña?" → "Ingresar token manualmente":',
    footerNote:
      'Por tu seguridad, este enlace solo puede usarse una vez. Si no solicitaste el cambio, tu contraseña actual sigue siendo válida.',
  }).replace(
    '</td>\n            </tr>\n            <tr>\n              <td style="padding:20px 32px;border-top:1px solid #334155;">',
    `</td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">Token de recuperación:</p>
                <p style="margin:0;padding:12px 16px;background-color:#0f172a;border-radius:8px;border:1px solid #334155;color:#e2e8f0;font-family:Consolas,Monaco,monospace;font-size:13px;word-break:break-all;">${escapeHtml(params.token)}</p>
                ${params.webResetUrl ? `<p style="margin:16px 0 0;color:#64748b;font-size:12px;">Enlace web alternativo: <a href="${params.webResetUrl}" style="color:#818cf8;">${escapeHtml(params.webResetUrl)}</a></p>` : ''}
                <p style="margin:16px 0 0;color:#64748b;font-size:12px;">Android (Gmail): <a href="${params.androidIntentUrl}" style="color:#818cf8;">Abrir Centinela</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #334155;">`,
  );
  const text =
    `Hola ${nombre},\n\n` +
    `Restablece tu contraseña en Centinela (expira en ${params.expiresInMinutes} minutos):\n\n` +
    `Abrir app:\n${params.appResetUrl}\n\n` +
    `Android (Gmail):\n${params.androidIntentUrl}\n\n` +
    (params.webResetUrl ? `Web:\n${params.webResetUrl}\n\n` : '') +
    `Token (pegar en la app → Ingresar token manualmente):\n${params.token}\n\n` +
    `Si no fuiste tú, ignora este mensaje.`;
  return { subject, html, text };
}
