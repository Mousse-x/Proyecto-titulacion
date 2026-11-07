/*
 * Traduce cualquier error (axios, fetch o JS) a un mensaje comprensible:
 * qué ocurrió, de qué tipo es y cómo corregirlo (heurísticas H9.1 y H9.3).
 *
 * kind:
 *  - validation : datos enviados incorrectos o incompletos (lo corrige el usuario)
 *  - auth       : sesión vencida
 *  - permission : el perfil no tiene permiso
 *  - notfound   : el registro ya no existe
 *  - conflict   : existe un proceso o registro que impide la acción
 *  - network    : no hay conexión con el servidor (error técnico)
 *  - timeout    : el servidor tardó demasiado (error técnico)
 *  - server     : falla interna del servidor (error técnico)
 */
const KIND_INFO = {
  validation: {
    title: 'Revisa los datos ingresados',
    hint: 'Corrige los campos indicados y vuelve a intentarlo.',
    technical: false,
  },
  auth: {
    title: 'Tu sesión expiró',
    hint: 'Vuelve a iniciar sesión para continuar. Los datos ya guardados no se pierden.',
    technical: false,
  },
  permission: {
    title: 'No tienes permiso para esta acción',
    hint: 'Tu perfil no permite realizarla. Solicítala al Administrador del Sistema.',
    technical: false,
  },
  notfound: {
    title: 'El registro no existe',
    hint: 'Es posible que otro usuario lo haya eliminado. Actualiza la página para ver los datos vigentes.',
    technical: false,
  },
  conflict: {
    title: 'La acción no puede completarse ahora',
    hint: 'Existe un proceso o registro que lo impide. Espera a que termine o revisa los datos duplicados.',
    technical: false,
  },
  network: {
    title: 'Sin conexión con el servidor',
    hint: 'Error técnico: verifica tu conexión a Internet o que el servidor esté activo y pulsa «Reintentar».',
    technical: true,
  },
  timeout: {
    title: 'El servidor tardó demasiado en responder',
    hint: 'Error técnico: el proceso puede seguir en curso. Espera unos minutos y pulsa «Reintentar».',
    technical: true,
  },
  server: {
    title: 'Error técnico del servidor',
    hint: 'No es un problema de tus datos. Pulsa «Reintentar»; si persiste, informa al Administrador del Sistema.',
    technical: true,
  },
};

function extractServerMessage(data) {
  if (!data) return '';
  if (typeof data === 'string') {
    // Respuestas HTML (p. ej. página de error de Django) no se muestran al usuario.
    return data.trim().startsWith('<') ? '' : data.slice(0, 300);
  }
  const direct = data.error || data.message || data.detail;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') return Object.values(direct).flat().join(' ');
  // Errores de validación por campo: { campo: ['mensaje'] }
  const fieldMessages = Object.entries(data)
    .filter(([, v]) => typeof v === 'string' || Array.isArray(v))
    .map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`);
  return fieldMessages.join(' · ');
}

export function errorKind(err) {
  if (!err) return 'server';
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) return 'timeout';
  const status = err.response?.status ?? err.status;
  if (!status) {
    if (err.request || /network|failed to fetch|load failed/i.test(err.message || '')) return 'network';
    return 'server';
  }
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';
  if (status === 404) return 'notfound';
  if (status === 409) return 'conflict';
  if (status === 413) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  return 'server';
}

/**
 * Devuelve { kind, title, message, hint, technical }.
 * `fallback` describe la acción que falló, p. ej. «No se pudo guardar la universidad».
 */
export function describeError(err, fallback = 'No se pudo completar la acción.') {
  const kind = errorKind(err);
  const info = KIND_INFO[kind];
  const status = err?.response?.status ?? err?.status;
  let serverMessage = extractServerMessage(err?.response?.data);
  if (!serverMessage && err?.message && !err?.response && kind !== 'network' && kind !== 'timeout') {
    serverMessage = err.message;
  }
  if (status === 413) serverMessage = serverMessage || 'El archivo supera el tamaño máximo permitido (50 MB).';
  const message = kind === 'server' || kind === 'network' || kind === 'timeout'
    ? fallback
    : (serverMessage || fallback);
  return {
    kind,
    status,
    title: info.title,
    message,
    hint: info.hint,
    technical: info.technical,
    detail: kind === 'server' && serverMessage ? serverMessage : '',
  };
}

/** Texto plano en una línea: útil para avisos breves. */
export function errorText(err, fallback) {
  const d = describeError(err, fallback);
  return `${d.message} ${d.hint}`;
}
