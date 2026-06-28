type AlertaLike = {
  tipo: string;
  descripcion?: string | null;
  zona?: { nombre: string } | null;
};

export type NotificationPayload = {
  id: string;
  title: string;
  body: string;
  zona: string;
  type: string;
  alertaId: string;
  timestamp: string;
  isRead: boolean;
};

const ALERTA_TYPE_LABELS: Record<string, string> = {
  PANICO: 'Emergencia',
  HOMICIDIO_SICARIATO: 'Homicidio / Sicariato',
  SECUESTRO: 'Secuestro',
  ROBO: 'Robo',
  EXTORSION: 'Extorsión',
  PERSONA_SOSPECHOSA: 'Persona sospechosa',
  VEHICULO_SOSPECHOSO: 'Vehículo sospechoso',
  AUDIO_IA: 'Alerta de audio',
  REPORTE_CIUDADANO: 'Reporte ciudadano',
  MANUAL: 'Alerta manual',
  SISTEMA: 'Alerta del sistema',
};

export function formatAlertaType(tipo: string): string {
  return (tipo || 'SISTEMA').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function resolveAlertaTipo(alerta: AlertaLike): string {
  const tipoNormalizado = formatAlertaType(alerta.tipo);

  if (tipoNormalizado !== 'REPORTE_CIUDADANO') {
    return tipoNormalizado;
  }

  const match = alerta.descripcion?.match(
    /^Reporte de ciudadano:\s*([A-Z_]+)/i,
  );
  if (match?.[1]) {
    return formatAlertaType(match[1]);
  }

  return tipoNormalizado;
}

export function formatAlertaTypeLabel(tipo: string): string {
  const key = formatAlertaType(tipo);
  if (ALERTA_TYPE_LABELS[key]) {
    return ALERTA_TYPE_LABELS[key];
  }

  return key
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export function buildNotificationTitle(alerta: AlertaLike): string {
  const tipo = resolveAlertaTipo(alerta);
  const label = formatAlertaTypeLabel(tipo);
  const zona = alerta.zona?.nombre ?? 'Sin zona';
  return `${label} — ${zona}`;
}

export function buildNotificationBody(alerta: AlertaLike): string {
  const raw = alerta.descripcion?.trim();
  if (!raw) {
    return `Se registró una alerta de ${formatAlertaTypeLabel(resolveAlertaTipo(alerta)).toLowerCase()}.`;
  }

  const reportMatch = raw.match(/^Reporte de ciudadano:\s*[A-Z_]+\s*-\s*(.+)$/i);
  if (reportMatch?.[1]) {
    const body = reportMatch[1].trim();
    return body || 'Sin descripción';
  }

  return raw;
}

export function buildNotificationPayload(input: {
  id: string;
  alertaId: string;
  createdAt: Date;
  leida?: boolean;
  alerta: AlertaLike;
}): NotificationPayload {
  const tipo = resolveAlertaTipo(input.alerta);

  return {
    id: input.id,
    title: buildNotificationTitle(input.alerta),
    body: buildNotificationBody(input.alerta),
    zona: input.alerta.zona?.nombre ?? 'Sin zona',
    type: tipo,
    alertaId: input.alertaId,
    timestamp: input.createdAt.toISOString(),
    isRead: input.leida ?? false,
  };
}

export function buildFcmDataPayload(
  payload: NotificationPayload,
): Record<string, string> {
  return {
    id: payload.id,
    title: payload.title,
    body: payload.body,
    zona: payload.zona,
    type: payload.type,
    alertaId: payload.alertaId,
    timestamp: payload.timestamp,
    isRead: String(payload.isRead),
  };
}
