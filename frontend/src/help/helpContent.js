/*
 * Ayuda y documentación de SisTransp (H10.1, H10.2, H10.3).
 * PAGE_HELP: ayuda contextual por pantalla (clave = último segmento de la ruta).
 * GLOSSARY, DIMENSIONS, STATUS_HELP, ERROR_HELP y FAQ alimentan el Centro de ayuda.
 */

export const DIMENSIONS = [
  { code: 'D1', name: 'Gobierno e información institucional', desc: 'Estructura, identidad, autoridades, órganos colegiados, normativa y entidades vinculadas.' },
  { code: 'D2', name: 'Planificación, integridad y rendición de cuentas', desc: 'Planes, seguimiento, rendición de cuentas, código ético, canal de denuncias y compromisos de servicio.' },
  { code: 'D3', name: 'Personal y gestión de talento humano', desc: 'Directorio, remuneraciones, licencias, contratos colectivos, selección y perfil del personal.' },
  { code: 'D4', name: 'Estudiantes, oferta y servicios universitarios', desc: 'Oferta académica, admisiones, becas, trámites, orientación y derechos estudiantiles.' },
  { code: 'D5', name: 'Gestión económica, financiera y contratación', desc: 'Presupuesto, ejecución, auditorías, contratación pública, deuda, viáticos y estados financieros.' },
  { code: 'D6', name: 'Resultados académicos, investigación y vinculación', desc: 'Investigación, rendimiento académico, satisfacción y empleabilidad. Proviene de referentes internacionales.' },
  { code: 'D7', name: 'Participación, colaboración y acceso a la información', desc: 'Acceso a la información, información reservada, audiencias, peticiones y participación.' },
  { code: 'D8', name: 'Transparencia digital, accesibilidad y datos abiertos', desc: 'Accesibilidad web, histórico, metadatos, interoperabilidad y catálogo de datos abiertos.' },
];

export const GLOSSARY = [
  { term: 'ITI · Índice de Transparencia Institucional', def: 'Resultado único (0–100 %) de una universidad. Integra el componente nacional LOTAIP y el componente internacional en ocho dimensiones (D1–D8). Se calcula como ITI = Σ (peso de la dimensión × puntaje de la dimensión). Es «Provisional» mientras falten indicadores por resolver.' },
  { term: 'Componente nacional (LOTAIP)', def: 'Cumplimiento de los 24 numerales del artículo 19 de la Ley Orgánica de Transparencia y Acceso a la Información Pública, evaluado sobre los documentos publicados en el Portal Nacional de Transparencia de la Defensoría del Pueblo (DPE).' },
  { term: 'Componente internacional (complementario)', def: 'Indicadores derivados de referentes internacionales (OGP, OCDE, ODS 16, WCAG, Open Data Charter) verificados con evidencia web citada. Se evalúa una vez al año y se aplica a todos los meses de ese año.' },
  { term: 'SITA', def: 'Índice de transparencia activa LOTAIP: promedio de CTA, ETA, RP y CI. SITA = (CTA + ETA + RP + CI) / 4.' },
  { term: 'CTA', def: 'Información completa y actualizada: el formato publicado contiene los datos exigidos por la norma.' },
  { term: 'ETA', def: 'Estructura de datos abiertos: el conjunto de datos, metadatos y diccionario respetan la estructura oficial.' },
  { term: 'RP', def: 'Registro dentro del plazo: la información se publicó dentro del período establecido.' },
  { term: 'CI', def: 'Calidad de la información: los datos son legibles, consistentes y sin errores de contenido.' },
  { term: 'Literal / numeral', def: 'Cada una de las obligaciones del artículo 19 de la LOTAIP (por ejemplo, «6 Presupuesto»). Los documentos se cargan vinculados a un literal.' },
  { term: 'Evidencia o documento', def: 'Archivo (PDF, XLSX, DOCX, CSV) o enlace que demuestra el cumplimiento de un literal o indicador.' },
  { term: 'Período', def: 'Año evaluado. Dentro de un período se pueden consultar los resultados de un mes concreto o de todos los meses.' },
  { term: 'Indicador', def: 'Criterio concreto que se califica con 0 (no cumple), 0,5 (parcial) o 1 (cumple). El ITI tiene 58 indicadores.' },
  { term: 'Ponderación', def: 'Peso que cada dimensión tiene en el ITI y cada indicador dentro de su dimensión. Ambos conjuntos deben sumar 100 %.' },
  { term: 'Escala de clasificación', def: 'Alto: 90 % o más · Medio: 70–89 % · Bajo: 40–69 % · Crítico: menos de 40 %.' },
];

export const STATUS_HELP = [
  { label: 'Cumple', kind: 'success', def: 'Se encontró evidencia suficiente y válida para el criterio.' },
  { label: 'Cumple parcialmente', kind: 'warning', def: 'Hay evidencia, pero incompleta o desactualizada (puntúa 0,5).' },
  { label: 'No cumple', kind: 'danger', def: 'Resultado de incumplimiento: la evidencia existe y fue revisada, pero no satisface el criterio.' },
  { label: 'Sin evidencia / No presentado', kind: 'subtle', def: 'Ausencia de evidencias: la universidad no publicó o no cargó el documento. No es un error del sistema.' },
  { label: 'Pendiente de comprobación', kind: 'warning', def: 'La evaluación no pudo confirmarse automáticamente y espera reintento o revisión manual.' },
  { label: 'Error técnico', kind: 'danger', def: 'Falla del procesamiento (enlace caído, archivo ilegible, servicio de IA no disponible). Se puede reintentar sin modificar los datos.' },
  { label: 'Provisional / Definitivo', kind: 'info', def: 'Provisional: aún hay indicadores sin resolver. Definitivo: todos los indicadores tienen resultado.' },
];

export const ERROR_HELP = [
  { msg: 'Revisa los datos ingresados', fix: 'Algún campo obligatorio está vacío o tiene un formato inválido. Corrige los campos marcados en rojo.' },
  { msg: 'Formato de archivo no permitido', fix: 'Solo se aceptan PDF, XLSX, XLS, DOCX, DOC o CSV. Convierte el archivo y vuelve a cargarlo.' },
  { msg: 'El archivo supera 50 MB', fix: 'Divide o comprime el documento antes de cargarlo.' },
  { msg: 'No hay documentos para la selección', fix: 'Carga los documentos LOTAIP o impórtalos desde el portal DPE para esa universidad, año y mes.' },
  { msg: 'Ya existe una evaluación en curso', fix: 'Espera a que termine o pulsa «Detener evaluación» y vuelve a iniciarla.' },
  { msg: 'Sin conexión con el servidor', fix: 'Error técnico: verifica tu conexión o que el servidor esté activo y pulsa «Reintentar».' },
  { msg: 'Tu sesión expiró', fix: 'Vuelve a iniciar sesión. Los datos guardados se conservan.' },
  { msg: 'No tienes permiso', fix: 'Tu perfil no permite la acción. Solicítala al Administrador del Sistema.' },
];

export const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], desc: 'Abrir la búsqueda rápida de pantallas y universidades' },
  { keys: ['Alt', 'H'], desc: 'Abrir la ayuda de la pantalla actual' },
  { keys: ['Alt', 'I'], desc: 'Ir al inicio (dashboard) del perfil' },
  { keys: ['Esc'], desc: 'Cerrar ventanas, ayuda o búsqueda' },
];

export const FAQ = [
  { q: '¿Por qué el ITI aparece como «Provisional» o «Pendiente»?', a: 'Porque falta ejecutar la evaluación nacional, la internacional o hay indicadores sin resolver. Abre «Evaluación de transparencia», revisa la cobertura y ejecuta la evaluación faltante.' },
  { q: '¿Qué diferencia hay entre «No cumple», «Sin evidencia» y «Error técnico»?', a: '«No cumple» significa que la evidencia se revisó y no satisface el criterio. «Sin evidencia» indica que no se publicó o cargó documento. «Error técnico» es una falla del procesamiento que se puede reintentar.' },
  { q: '¿Cómo corrijo un documento cargado por error?', a: 'En «Documentos LOTAIP» abre la carpeta del documento y usa «Editar» para cambiar el título o «Reemplazar» para subir el archivo correcto; el anterior se elimina tras confirmar.' },
  { q: '¿Puedo abandonar una evaluación en curso?', a: 'Sí. Pulsa «Detener evaluación»; los resultados anteriores se conservan. Puedes volver a ejecutarla cuando quieras.' },
  { q: '¿Cómo genero un reporte?', a: 'En «Reportes» elige el tipo, la universidad y el mes, revisa la vista previa y pulsa «Exportar». Los filtros aplicados aparecen en el archivo.' },
  { q: '¿Cómo encuentro rápidamente una universidad o pantalla?', a: 'Pulsa Ctrl + K (o el botón «Buscar» del encabezado) y escribe el nombre o las siglas.' },
];

const DOCUMENTS_HELP = {
  title: 'Documentos LOTAIP',
  purpose: 'Gestiona las evidencias LOTAIP organizadas en carpetas: universidad → año → mes → literal.',
  steps: [
    'Usa el buscador o los filtros de universidad y mes para localizar documentos.',
    'Pulsa «Subir documento», completa los campos marcados con * y arrastra o selecciona el archivo.',
    'Formatos aceptados: PDF, XLSX, XLS, DOCX, DOC y CSV, hasta 50 MB. El sistema valida tipo, tamaño, universidad y literal antes de aceptarlo.',
    'Para corregir un documento usa «Editar» (título) o «Reemplazar» (archivo). Eliminar siempre pide confirmación.',
    '«Importar desde portal DPE» descarga automáticamente los literales publicados por la universidad en el Portal Nacional de Transparencia.',
  ],
  tips: ['El recorrido de carpetas (migas de pan) permite volver a cualquier nivel sin perder los filtros.'],
};

const VALIDATION_HELP = {
  title: 'Evaluación de transparencia',
  purpose: 'Ejecuta y consulta por separado la evaluación nacional (LOTAIP) y la internacional; juntas forman el ITI.',
  steps: [
    'Elige universidad, año y mes (opcional). Se muestra cuántos documentos hay disponibles.',
    '«Evaluar solo LOTAIP» analiza los documentos nacionales y calcula CTA, ETA, RP, CI y SITA.',
    '«Evaluar solo internacionales» busca y verifica evidencia web con apoyo de IA para los 34 indicadores complementarios.',
    'Durante la evaluación verás la fase, el porcentaje y los subprocesos. Puedes detenerla en cualquier momento.',
    'Al terminar aparece un aviso de «Completada», «Detenida» o «Fallida». Si falla, pulsa «Reintentar».',
  ],
  tips: [
    'Las pestañas «Nacional · LOTAIP» e «Internacional» muestran por separado el detalle de criterios y sus fuentes.',
    '«Error técnico» se puede reintentar indicador por indicador; «Sin evidencia» no es un error del sistema.',
  ],
};

const INDEX_HELP = {
  title: 'Índice de Transparencia Institucional',
  purpose: 'Muestra el ITI de una universidad, su clasificación y el puntaje por cada una de las ocho dimensiones.',
  steps: [
    'Selecciona la universidad en la lista superior.',
    'El índice nacional corresponde a LOTAIP; el ITI integra lo nacional y lo internacional.',
    'Las barras D1–D8 muestran el aporte de cada dimensión; pasa el cursor para ver el valor.',
    'Pulsa «Ver desglose de indicadores y evidencias» para revisar cada criterio y su fuente.',
  ],
};

const RANKINGS_HELP = {
  title: 'Rankings',
  purpose: 'Clasifica a las universidades por su ITI en el período seleccionado.',
  steps: [
    'Elige el período en la lista superior.',
    'Selecciona una universidad de la tabla para ver su detalle por dimensión.',
    'Usa «Ver desglose» para ir directamente a sus indicadores y evidencias.',
  ],
};

const COMPARATIVES_HELP = {
  title: 'Análisis comparativo',
  purpose: 'Compara dos universidades por índice, componentes LOTAIP y dimensiones.',
  steps: ['Elige las universidades en cada selector.', 'Revisa los gráficos y la tabla de valores para comparar cada componente.'],
};

const REPORTS_HELP = {
  title: 'Reportes',
  purpose: 'Genera y exporta informes con los datos reales del sistema.',
  steps: [
    'Elige el tipo de reporte, la universidad y el mes.',
    'Revisa la vista previa: muestra exactamente lo que se exportará.',
    'Pulsa «Exportar». Si no hay datos para los filtros, el botón se desactiva y se explica el motivo.',
  ],
};

const FEEDBACK_HELP = {
  title: 'Comentarios',
  purpose: 'Envía o gestiona comentarios y sugerencias sobre la transparencia y el sistema.',
  steps: ['Completa el asunto y el mensaje y pulsa «Enviar».', 'El administrador puede filtrar los comentarios y cambiar su estado.'],
};

const DASHBOARD_HELP = {
  title: 'Panel de inicio',
  purpose: 'Resumen del estado de la transparencia: índices, documentos y evaluaciones del período.',
  steps: [
    'Cambia el período para actualizar todas las cifras.',
    'Usa el menú lateral para ir a cada módulo o pulsa Ctrl + K para buscar una pantalla o universidad.',
  ],
};

export const PAGE_HELP = {
  dashboard: DASHBOARD_HELP,
  users: {
    title: 'Gestión de usuarios',
    purpose: 'Crea, edita, activa/desactiva y elimina cuentas y asigna su perfil.',
    steps: [
      'Pulsa «Nuevo usuario», completa nombre, correo y rol (campos con *).',
      'El correo debe tener un formato válido; se indica el error junto al campo.',
      'Desactivar una cuenta es reversible; eliminarla pide confirmación y no se puede deshacer.',
    ],
    tips: ['Tu propia cuenta y la del superadministrador están protegidas.'],
  },
  universities: {
    title: 'Universidades',
    purpose: 'Consulta y mantiene el registro de instituciones evaluadas.',
    steps: [
      'Usa el buscador de la tabla para localizar una universidad por siglas, nombre, ciudad o provincia.',
      'Pulsa «Editar», modifica los datos y «Guardar». Si cierras con cambios sin guardar, se te pedirá confirmación.',
      'El ID DPE es el número que aparece después de /entidades/ en el portal de la Defensoría (botón «Ayuda» del formulario).',
    ],
  },
  indicators: {
    title: 'Indicadores de transparencia',
    purpose: 'Catálogo de los 58 indicadores: nacionales (LOTAIP), mixtos y complementarios.',
    steps: ['Filtra por dimensión o tipo para encontrar un indicador.', 'Edita su nombre o plantilla; eliminar pide confirmación.'],
  },
  weightings: {
    title: 'Ponderaciones',
    purpose: 'Define el peso de cada dimensión en el ITI y de cada indicador dentro de su dimensión.',
    steps: ['Los pesos de las ocho dimensiones deben sumar 100 %.', 'Los pesos de los indicadores de cada dimensión también deben sumar 100 %.', 'Los cambios no alteran evaluaciones históricas: cada resultado guarda los pesos usados.'],
  },
  rankings: RANKINGS_HELP,
  reports: REPORTS_HELP,
  audit: {
    title: 'Auditoría',
    purpose: 'Registro de las acciones realizadas en el sistema para su trazabilidad.',
    steps: ['Filtra por usuario, acción o fecha.', 'Cada registro indica quién, qué y cuándo.'],
  },
  feedback: FEEDBACK_HELP,
  documents: DOCUMENTS_HELP,
  validation: VALIDATION_HELP,
  index: INDEX_HELP,
  comparatives: COMPARATIVES_HELP,
  observations: {
    title: 'Observaciones',
    purpose: 'Observaciones registradas por el auditor sobre los documentos de tu institución.',
    steps: ['Revisa cada observación y corrige o reemplaza el documento en «Documentos LOTAIP».'],
  },
  ayuda: {
    title: 'Centro de ayuda',
    purpose: 'Guía de uso, glosario del índice, significado de estados y solución a mensajes de error.',
    steps: ['Usa el índice de la izquierda o el buscador para encontrar un tema.'],
  },
};

export function helpForPath(pathname = '') {
  const key = pathname.split('/').filter(Boolean).pop() || 'dashboard';
  return PAGE_HELP[key] || DASHBOARD_HELP;
}
