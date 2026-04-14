// ═══════════════════════════════════════════════════════════════
// MOCK DATA — Plataforma de Transparencia ESPOCH
// ═══════════════════════════════════════════════════════════════

// ─── USUARIOS ───────────────────────────────────────────────────
export const mockUsers = [
  {
    id: 1, role_id: 1, role_name: "Administrador del Sistema",
    full_name: "Carlos Mendoza Rivera", email: "admin@transparencia.ec",
    password: "admin123", university_id: null, is_active: true,
    last_login: "2026-04-12T14:30:00Z", created_at: "2025-01-15T08:00:00Z",
  },
  {
    id: 2, role_id: 2, role_name: "Administrador Universitario",
    full_name: "Ing. María Fernanda Ortiz", email: "admin@espoch.edu.ec",
    password: "admin123", university_id: 1, is_active: true,
    last_login: "2026-04-12T10:15:00Z", created_at: "2025-02-01T09:00:00Z",
  },
  {
    id: 3, role_id: 2, role_name: "Administrador Universitario",
    full_name: "Dr. Roberto Salinas", email: "admin@uce.edu.ec",
    password: "admin123", university_id: 3, is_active: true,
    last_login: "2026-04-11T16:00:00Z", created_at: "2025-02-10T09:00:00Z",
  },
  {
    id: 4, role_id: 4, role_name: "Auditor",
    full_name: "Lcda. Patricia Vásquez", email: "auditor@caces.gob.ec",
    password: "admin123", university_id: null, is_active: true,
    last_login: "2026-04-12T09:00:00Z", created_at: "2025-03-01T09:00:00Z",
  },
  {
    id: 5, role_id: 4, role_name: "Auditor",
    full_name: "Msc. Jorge Benalcázar", email: "jbenalcazar@caces.gob.ec",
    password: "admin123", university_id: null, is_active: false,
    last_login: "2026-03-20T11:00:00Z", created_at: "2025-03-05T09:00:00Z",
  },
  {
    id: 6, role_id: 2, role_name: "Administrador Universitario",
    full_name: "Dr. Andrés Villacís", email: "admin@puce.edu.ec",
    password: "admin123", university_id: 2, is_active: true,
    last_login: "2026-04-10T14:00:00Z", created_at: "2025-02-15T09:00:00Z",
  },
];

// ─── ROLES ──────────────────────────────────────────────────────
export const mockRoles = [
  { id: 1, name: "Administrador del Sistema" },
  { id: 2, name: "Administrador Universitario" },
  { id: 3, name: "Evaluador" },
  { id: 4, name: "Auditor" },
];

// ─── UNIVERSIDADES ───────────────────────────────────────────────
export const mockUniversities = [
  {
    id: 1, name: "ESPOCH", full_name: "Escuela Superior Politécnica de Chimborazo",
    city: "Riobamba", province: "Chimborazo", type: "Pública",
    website: "https://www.espoch.edu.ec", phone: "(03) 2998-200",
    rector: "Dr. Óscar Granizo Rodríguez", students: 18500,
    faculties: 10, departments: 42, is_active: true,
    logo_initials: "ESP", color: "#6366F1",
    transparency_score: 82.4, rank: 1,
    address: "Panamericana Sur Km 1½, Riobamba",
    accreditation: "A", founded: 1969,
  },
  {
    id: 2, name: "PUCE", full_name: "Pontificia Universidad Católica del Ecuador",
    city: "Quito", province: "Pichincha", type: "Particular cofinanciada",
    website: "https://www.puce.edu.ec", phone: "(02) 299-1700",
    rector: "Dr. Gabriel Pazmiño Armijos", students: 24000,
    faculties: 16, departments: 65, is_active: true,
    logo_initials: "PUCE", color: "#8B5CF6",
    transparency_score: 79.8, rank: 2,
    address: "Av. 12 de Octubre 1076 y Roca, Quito",
    accreditation: "A", founded: 1946,
  },
  {
    id: 3, name: "UCE", full_name: "Universidad Central del Ecuador",
    city: "Quito", province: "Pichincha", type: "Pública",
    website: "https://www.uce.edu.ec", phone: "(02) 395-2300",
    rector: "Dr. Fernando Sempértegui", students: 45000,
    faculties: 19, departments: 89, is_active: true,
    logo_initials: "UCE", color: "#10B981",
    transparency_score: 71.3, rank: 3,
    address: "Ciudadela Universitaria, Quito",
    accreditation: "B", founded: 1826,
  },
  {
    id: 4, name: "UTPL", full_name: "Universidad Técnica Particular de Loja",
    city: "Loja", province: "Loja", type: "Particular cofinanciada",
    website: "https://www.utpl.edu.ec", phone: "(07) 370-1444",
    rector: "Dra. Zaira Vivas", students: 32000,
    faculties: 6, departments: 38, is_active: true,
    logo_initials: "UTPL", color: "#F59E0B",
    transparency_score: 68.9, rank: 4,
    address: "San Cayetano Alto, Loja",
    accreditation: "B", founded: 1971,
  },
  {
    id: 5, name: "UG", full_name: "Universidad de Guayaquil",
    city: "Guayaquil", province: "Guayas", type: "Pública",
    website: "https://www.ug.edu.ec", phone: "(04) 228-9070",
    rector: "Dr. Galo Naranjo López", students: 68000,
    faculties: 24, departments: 110, is_active: true,
    logo_initials: "UG", color: "#EF4444",
    transparency_score: 63.2, rank: 5,
    address: "Ciudadela Universitaria, Av. Delta y Av. Kennedy, Guayaquil",
    accreditation: "C", founded: 1867,
  },
];

// ─── INDICADORES LOTAIP + INTERNACIONALES ────────────────────────
export const mockIndicators = [
  // Categoría: Estructura Institucional
  { id: 1, code: "LOT-7a", name: "Estructura orgánica funcional", article: "Art. 7 Lit. a)", category: "Estructura", weight: 4.5, max_score: 100, description: "Publicación de la estructura orgánica actualizada con funciones y responsabilidades.", framework: "LOTAIP", is_active: true },
  { id: 2, code: "LOT-7b", name: "Base legal que rige la institución", article: "Art. 7 Lit. b)", category: "Estructura", weight: 3.0, max_score: 100, description: "Publicación de la normativa legal vigente que regula a la institución.", framework: "LOTAIP", is_active: true },
  { id: 3, code: "LOT-7c", name: "Regulaciones y procedimientos", article: "Art. 7 Lit. c)", category: "Estructura", weight: 3.5, max_score: 100, description: "Reglamentos, estatutos y procedimientos internos disponibles al público.", framework: "LOTAIP", is_active: true },
  // Categoría: Planificación
  { id: 4, code: "LOT-7d", name: "Metas y objetivos institucionales", article: "Art. 7 Lit. d)", category: "Planificación", weight: 4.0, max_score: 100, description: "Plan estratégico, POA y planes de mejora institutcional publicados.", framework: "LOTAIP", is_active: true },
  { id: 5, code: "LOT-7i", name: "Planes y programas en ejecución", article: "Art. 7 Lit. i)", category: "Planificación", weight: 4.5, max_score: 100, description: "Programas académicos, investigación y vinculación en ejecución.", framework: "LOTAIP", is_active: true },
  // Categoría: Talento Humano
  { id: 6, code: "LOT-7e", name: "Nómina de personal y remuneraciones", article: "Art. 7 Lit. e)", category: "Talento Humano", weight: 5.0, max_score: 100, description: "Directorio de servidores públicos con cargos y remuneraciones publicado.", framework: "LOTAIP", is_active: true },
  { id: 7, code: "LOT-7k", name: "Mecanismos de rendición de cuentas", article: "Art. 7 Lit. k)", category: "Talento Humano", weight: 4.0, max_score: 100, description: "Informes de gestión y resultados de auditoría publicados.", framework: "LOTAIP", is_active: true },
  // Categoría: Servicios
  { id: 8, code: "LOT-7f", name: "Servicios que ofrece la institución", article: "Art. 7 Lit. f)", category: "Servicios", weight: 3.5, max_score: 100, description: "Carta de servicios con requisitos, tiempos y responsables publicada.", framework: "LOTAIP", is_active: true },
  { id: 9, code: "LOT-7g", name: "Información financiera y presupuestaria", article: "Art. 7 Lit. g)", category: "Financiero", weight: 6.0, max_score: 100, description: "Presupuestos aprobados, ejecución presupuestaria y estados financieros.", framework: "LOTAIP", is_active: true },
  { id: 10, code: "LOT-7h", name: "Procesos de contratación pública", article: "Art. 7 Lit. h)", category: "Contratación", weight: 6.0, max_score: 100, description: "Información de licitaciones, contratos y proveedores publicada en SERCOP.", framework: "LOTAIP", is_active: true },
  { id: 11, code: "LOT-7j", name: "Participación ciudadana", article: "Art. 7 Lit. j)", category: "Participación", weight: 3.5, max_score: 100, description: "Mecanismos de participación y consulta ciudadana activos.", framework: "LOTAIP", is_active: true },
  { id: 12, code: "LOT-7l", name: "Texto de contratos colectivos", article: "Art. 7 Lit. l)", category: "Talento Humano", weight: 3.0, max_score: 100, description: "Contratos colectivos y actas de finiquito disponibles.", framework: "LOTAIP", is_active: true },
  // Categoría: Internacional
  { id: 13, code: "INT-OGP1", name: "Gobierno abierto — datos reutilizables", article: "OGP Principio 1", category: "Internacional", weight: 5.0, max_score: 100, description: "Portal de datos abiertos con datasets en formatos reutilizables.", framework: "OGP", is_active: true },
  { id: 14, code: "INT-OGP2", name: "Participación e innovación digital", article: "OGP Principio 2", category: "Internacional", weight: 4.0, max_score: 100, description: "Canales digitales de participación e innovación ciudadana.", framework: "OGP", is_active: true },
  { id: 15, code: "INT-OCDE1", name: "Integridad pública institucional", article: "OCDE Rec. 2017", category: "Internacional", weight: 5.5, max_score: 100, description: "Código de ética, declaraciones de bienes y conflictos de interés.", framework: "OCDE", is_active: true },
  { id: 16, code: "INT-OCDE2", name: "Rendición de cuentas proactiva", article: "OCDE Rec. 2017", category: "Internacional", weight: 5.0, max_score: 100, description: "Informes proactivos y auditorías externas disponibles al público.", framework: "OCDE", is_active: true },
  { id: 17, code: "INT-SDG1", name: "Acceso a la información (ODS 16.10)", article: "ODS Meta 16.10", category: "Internacional", weight: 5.5, max_score: 100, description: "Cumplimiento del derecho de acceso a la información pública.", framework: "ODS", is_active: true },
  { id: 18, code: "INT-SDG2", name: "Instituciones eficaces y transparentes (ODS 16)", article: "ODS Meta 16.6", category: "Internacional", weight: 5.5, max_score: 100, description: "Indicadores de eficacia institucional y rendición de cuentas alineados ODS.", framework: "ODS", is_active: true },
];

// ─── PONDERACIONES ───────────────────────────────────────────────
export const mockWeightings = {
  categories: [
    { name: "Financiero",       weight: 20, color: "#6366F1" },
    { name: "Contratación",     weight: 18, color: "#8B5CF6" },
    { name: "Internacional",    weight: 17, color: "#10B981" },
    { name: "Talento Humano",   weight: 15, color: "#F59E0B" },
    { name: "Planificación",    weight: 12, color: "#3B82F6" },
    { name: "Estructura",       weight: 10, color: "#EC4899" },
    { name: "Servicios",        weight: 5,  color: "#14B8A6" },
    { name: "Participación",    weight: 3,  color: "#F97316" },
  ],
  frameworks: [
    { name: "LOTAIP", weight: 55, description: "Ley Orgánica de Transparencia y Acceso a la Información Pública" },
    { name: "OGP",    weight: 15, description: "Open Government Partnership" },
    { name: "OCDE",   weight: 20, description: "Organización para la Cooperación y el Desarrollo Económicos" },
    { name: "ODS",    weight: 10, description: "Objetivos de Desarrollo Sostenible - ONU" },
  ],
};

// ─── PUNTUACIONES POR UNIVERSIDAD E INDICADOR ────────────────────
export const mockScores = {
  1: { // ESPOCH
    1:85, 2:92, 3:78, 4:88, 5:90,
    6:80, 7:75, 8:85, 9:88, 10:82,
    11:70, 12:76, 13:78, 14:65, 15:85,
    16:80, 17:88, 18:82,
  },
  2: { // PUCE
    1:80, 2:88, 3:75, 4:82, 5:85,
    6:75, 7:72, 8:80, 9:85, 10:78,
    11:65, 12:72, 13:75, 14:60, 15:80,
    16:76, 17:84, 18:78,
  },
  3: { // UCE
    1:70, 2:78, 3:65, 4:72, 5:75,
    6:68, 7:62, 8:70, 9:75, 10:68,
    11:55, 12:62, 13:65, 14:50, 15:70,
    16:66, 17:74, 18:68,
  },
  4: { // UTPL
    1:65, 2:74, 3:60, 4:68, 5:70,
    6:63, 7:58, 8:65, 9:70, 10:63,
    11:50, 12:58, 13:60, 14:45, 15:65,
    16:61, 17:69, 18:63,
  },
  5: { // UG
    1:58, 2:65, 3:52, 4:60, 5:63,
    6:55, 7:50, 8:58, 9:63, 10:55,
    11:42, 12:50, 13:52, 14:38, 15:58,
    16:54, 17:62, 18:55,
  },
};

// ─── HISTORIAL DE ÍNDICE (2022–2026) ─────────────────────────────
export const mockHistoricalScores = [
  {
    year: 2022,
    ESPOCH: 65.2, PUCE: 63.1, UCE: 55.8, UTPL: 52.4, UG: 48.3,
  },
  {
    year: 2023,
    ESPOCH: 71.8, PUCE: 68.9, UCE: 60.1, UTPL: 57.2, UG: 52.6,
  },
  {
    year: 2024,
    ESPOCH: 76.3, PUCE: 74.5, UCE: 65.8, UTPL: 62.1, UG: 57.9,
  },
  {
    year: 2025,
    ESPOCH: 79.1, PUCE: 77.2, UCE: 68.4, UTPL: 65.8, UG: 60.3,
  },
  {
    year: 2026,
    ESPOCH: 82.4, PUCE: 79.8, UCE: 71.3, UTPL: 68.9, UG: 63.2,
  },
];

// ─── DOCUMENTOS ESPOCH ────────────────────────────────────────────
export const mockDocuments = [
  { id: 1, indicator_id: 9, indicator_code: "LOT-7g", title: "Presupuesto Institucional 2026", type: "PDF", size: "2.4 MB", status: "Aprobado", uploaded_at: "2026-03-15", uploaded_by: "María Ortiz", validated_by: "Patricia Vásquez", url: "#", observations: null },
  { id: 2, indicator_id: 10, indicator_code: "LOT-7h", title: "Informe de Contratación Pública Q1-2026", type: "PDF", size: "1.8 MB", status: "Aprobado", uploaded_at: "2026-03-20", uploaded_by: "María Ortiz", validated_by: "Patricia Vásquez", url: "#", observations: null },
  { id: 3, indicator_id: 6, indicator_code: "LOT-7e", title: "Nómina Personal Docente Abril 2026", type: "XLSX", size: "890 KB", status: "En revisión", uploaded_at: "2026-04-05", uploaded_by: "María Ortiz", validated_by: null, url: "#", observations: null },
  { id: 4, indicator_id: 1, indicator_code: "LOT-7a", title: "Organigrama Institucional 2026", type: "PDF", size: "3.1 MB", status: "Aprobado", uploaded_at: "2026-02-28", uploaded_by: "María Ortiz", validated_by: "Patricia Vásquez", url: "#", observations: null },
  { id: 5, indicator_id: 4, indicator_code: "LOT-7d", title: "Plan Estratégico ESPOCH 2025-2029", type: "PDF", size: "5.2 MB", status: "Aprobado", uploaded_at: "2026-01-10", uploaded_by: "María Ortiz", validated_by: "Patricia Vásquez", url: "#", observations: null },
  { id: 6, indicator_id: 13, indicator_code: "INT-OGP1", title: "Portal Datos Abiertos ESPOCH", type: "URL", size: "-", status: "En revisión", uploaded_at: "2026-04-08", uploaded_by: "María Ortiz", validated_by: null, url: "#", observations: "Verificar que los datasets estén en formato CSV y JSON." },
  { id: 7, indicator_id: 11, indicator_code: "LOT-7j", title: "Informe Rendición de Cuentas 2025", type: "PDF", size: "4.7 MB", status: "Rechazado", uploaded_at: "2026-03-25", uploaded_by: "María Ortiz", validated_by: "Patricia Vásquez", url: "#", observations: "El informe no incluye indicadores cuantitativos de gestión. Favor revisar el Art. 12 de la LOTAIP." },
  { id: 8, indicator_id: 15, indicator_code: "INT-OCDE1", title: "Código de Ética ESPOCH 2025", type: "PDF", size: "1.2 MB", status: "Aprobado", uploaded_at: "2026-02-14", uploaded_by: "María Ortiz", validated_by: "Patricia Vásquez", url: "#", observations: null },
];

// ─── OBSERVACIONES ────────────────────────────────────────────────
export const mockObservations = [
  { id: 1, document_id: 7, auditor: "Patricia Vásquez", date: "2026-03-28", severity: "Alta", status: "Pendiente", university: "ESPOCH", message: "El informe de rendición de cuentas no incluye indicadores cuantitativos de gestión conforme al Art. 12 LOTAIP. Debe corregirse y resubirse antes del 15 de abril.", indicator_code: "LOT-7j" },
  { id: 2, document_id: 6, auditor: "Patricia Vásquez", date: "2026-04-09", severity: "Media", status: "En proceso", university: "ESPOCH", message: "Verificar que los datasets del portal de datos abiertos estén publicados en formatos reutilizables (CSV, JSON) y con licencia abierta.", indicator_code: "INT-OGP1" },
  { id: 3, document_id: 3, auditor: null, date: "2026-04-05", severity: "Baja", status: "Pendiente", university: "ESPOCH", message: "La nómina de personal debe incluir todos los contratos ocasionales según la LOSEP Art. 58.", indicator_code: "LOT-7e" },
  { id: 4, document_id: null, auditor: "Jorge Benalcázar", date: "2026-03-10", severity: "Alta", status: "Resuelta", university: "UCE", message: "La UCE no ha publicado su presupuesto ejecutado del año 2025. Incumplimiento LOTAIP Art. 7 Lit. g).", indicator_code: "LOT-7g" },
  { id: 5, document_id: null, auditor: "Patricia Vásquez", date: "2026-02-20", severity: "Media", status: "Resuelta", university: "UTPL", message: "Contratos de adquisición de bienes superiores a $75,000 no reflejan proceso en SERCOP.", indicator_code: "LOT-7h" },
];

// ─── ACTIVIDAD LOG ────────────────────────────────────────────────
export const mockActivityLog = [
  { id: 1, user: "María Ortiz", action: "Subida de documento", detail: "Nómina Personal Docente Abril 2026", time: "hace 2 horas", icon: "📄", type: "upload" },
  { id: 2, user: "Patricia Vásquez", action: "Observación creada", detail: "Indicador LOT-7j — Rendición de Cuentas", time: "hace 3 horas", icon: "🔍", type: "observation" },
  { id: 3, user: "María Ortiz", action: "Documento aprobado", detail: "Contratación Pública Q1-2026", time: "hace 5 horas", icon: "✅", type: "approved" },
  { id: 4, user: "Sistema", action: "Cálculo de índice", detail: "ESPOCH: 82.4 puntos — Rank #1", time: "hace 1 día", icon: "📊", type: "system" },
  { id: 5, user: "Carlos Mendoza", action: "Usuario creado", detail: "jorge.benalcazar@caces.gob.ec", time: "hace 2 días", icon: "👤", type: "user" },
  { id: 6, user: "Patricia Vásquez", action: "Validación de documentos", detail: "Revisados 8 documentos ESPOCH", time: "hace 3 días", icon: "🔎", type: "validation" },
];

// ─── RADAR DATA PER UNIVERSITY ────────────────────────────────────
export const getRadarData = (univId) => {
  const scores = mockScores[univId] || {};
  const categories = [
    { cat: "Estructura",    ids: [1,2,3] },
    { cat: "Planificación", ids: [4,5] },
    { cat: "Talento Humano",ids: [6,7,12] },
    { cat: "Servicios",     ids: [8] },
    { cat: "Financiero",    ids: [9] },
    { cat: "Contratación",  ids: [10] },
    { cat: "Participación", ids: [11] },
    { cat: "Internacional", ids: [13,14,15,16,17,18] },
  ];
  return categories.map(c => ({
    subject: c.cat,
    score: Math.round(c.ids.reduce((sum,id) => sum + (scores[id] || 0), 0) / c.ids.length),
    fullMark: 100,
  }));
};

// ─── RANKINGS ─────────────────────────────────────────────────────
export const mockRankings = mockUniversities
  .map(u => ({
    ...u,
    categories: {
      Estructura:    Math.round([1,2,3].reduce((s,i) => s + (mockScores[u.id][i]||0),0)/3),
      Planificación: Math.round([4,5].reduce((s,i)   => s + (mockScores[u.id][i]||0),0)/2),
      Financiero:    mockScores[u.id][9] || 0,
      Contratación:  mockScores[u.id][10] || 0,
      Internacional: Math.round([13,14,15,16,17,18].reduce((s,i) => s + (mockScores[u.id][i]||0),0)/6),
    }
  }))
  .sort((a,b) => b.transparency_score - a.transparency_score);

// ─── STATS SISTEMA ────────────────────────────────────────────────
export const mockSystemStats = {
  total_universities: 5,
  active_users: 6,
  total_documents: 124,
  pending_reviews: 18,
  approved_docs: 89,
  rejected_docs: 7,
  avg_transparency: 73.1,
  indicators_active: 18,
  observations_open: 3,
  last_calculation: "2026-04-12T08:00:00Z",
};

// ─── HELPER: SCORE COLOR ──────────────────────────────────────────
export const getScoreColor = (score) => {
  if (score >= 80) return "#10B981";
  if (score >= 65) return "#F59E0B";
  if (score >= 50) return "#EF4444";
  return "#64748B";
};

export const getScoreLabel = (score) => {
  if (score >= 80) return "Excelente";
  if (score >= 65) return "Bueno";
  if (score >= 50) return "Regular";
  return "Deficiente";
};

export const getStatusClass = (status) => {
  const map = { "Aprobado":"success", "En revisión":"warning", "Rechazado":"danger", "Pendiente":"warning", "Resuelta":"success", "En proceso":"info" };
  return map[status] || "subtle";
};
