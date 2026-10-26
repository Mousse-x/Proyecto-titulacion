from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = Path(__file__).resolve().parent
OUT_PATH = OUT_DIR / "Historias_de_usuario_y_tecnicas_SisTransp.docx"

NAVY = "17365D"
BLUE = "DCE6F1"
PALE = "F3F6FA"
GRAY = "D9D9D9"
BLACK = RGBColor(0, 0, 0)


USER_STORIES = [
    {
        "id": "HU-01", "epic": "Acceso y seguridad", "title": "Registro de auditor",
        "actor": "Auditor", "priority": "Alta", "estimate": "3 días", "deps": "HT-03, HT-04",
        "story": "Como auditor quiero crear una cuenta con mis datos institucionales para consultar y revisar las evaluaciones de transparencia.",
        "criteria": [
            "Dado un correo no registrado y datos válidos, cuando el auditor envía el formulario, entonces el sistema crea la cuenta con el rol Auditor.",
            "Dado un correo ya registrado, cuando se intenta crear otra cuenta, entonces el sistema rechaza la solicitud sin duplicar información.",
            "Dado un formulario incompleto o una contraseña inválida, el sistema identifica los campos que deben corregirse.",
            "La cuenta creada puede iniciar el flujo de autenticación sin recibir permisos administrativos.",
        ],
    },
    {
        "id": "HU-02", "epic": "Acceso y seguridad", "title": "Inicio de sesión con segundo factor",
        "actor": "Todos los perfiles", "priority": "Muy alta", "estimate": "4 días", "deps": "HU-01, HT-03",
        "story": "Como usuario registrado quiero iniciar sesión mediante correo, contraseña y verificación de segundo factor para acceder únicamente a las funciones de mi perfil.",
        "criteria": [
            "Las credenciales correctas generan un desafío de segundo factor cuando la configuración de seguridad lo exige.",
            "Un código vigente y correcto permite emitir la sesión y redirigir al panel del rol correspondiente.",
            "Las credenciales incorrectas, cuentas inactivas y códigos vencidos no permiten el acceso.",
            "El sistema registra los accesos exitosos y fallidos sin almacenar contraseñas ni códigos en texto legible.",
        ],
    },
    {
        "id": "HU-03", "epic": "Acceso y seguridad", "title": "Recuperación de contraseña",
        "actor": "Todos los perfiles", "priority": "Alta", "estimate": "3 días", "deps": "HT-03",
        "story": "Como usuario quiero solicitar un enlace temporal de recuperación para restablecer mi contraseña cuando no pueda acceder a mi cuenta.",
        "criteria": [
            "La solicitud devuelve un mensaje neutro, exista o no el correo, para no revelar cuentas registradas.",
            "El token de recuperación es de un solo uso, tiene fecha de expiración y se almacena de forma segura.",
            "Una contraseña válida actualiza la cuenta e invalida el token utilizado.",
            "Los enlaces vencidos, alterados o usados previamente son rechazados.",
        ],
    },
    {
        "id": "HU-04", "epic": "Administración", "title": "Gestión de usuarios roles y estados",
        "actor": "Administrador del Sistema", "priority": "Alta", "estimate": "5 días", "deps": "HU-02, HT-04",
        "story": "Como administrador del sistema quiero crear, buscar, editar, activar o inactivar usuarios y asignarles roles para controlar el acceso a la plataforma.",
        "criteria": [
            "El administrador puede filtrar usuarios por nombre, correo, rol y estado.",
            "La creación y edición validan unicidad del correo y existencia del rol seleccionado.",
            "Un usuario inactivo pierde acceso sin eliminar su historial.",
            "Las reglas especiales del superadministrador y el límite configurado de administradores se aplican antes de guardar.",
            "Cada cambio de rol o estado queda registrado en auditoría.",
        ],
    },
    {
        "id": "HU-05", "epic": "Administración", "title": "Gestión de universidades",
        "actor": "Administrador del Sistema y Administrador Universitario", "priority": "Alta", "estimate": "5 días", "deps": "HU-02, HT-02",
        "story": "Como usuario autorizado quiero registrar y mantener los datos de las universidades para asociar correctamente evidencias, evaluaciones y resultados.",
        "criteria": [
            "Cada universidad contiene nombre, siglas, ubicación, tipo, sitio web, estado y logotipo opcional.",
            "El sistema valida nombres y siglas duplicadas y conserva las relaciones históricas al inactivar una universidad.",
            "El identificador del portal de transparencia de la Defensoría del Pueblo puede registrarse desde un número o una URL válida.",
            "El Administrador Universitario solo modifica la institución que tenga asignada cuando aplique la restricción institucional.",
        ],
    },
    {
        "id": "HU-06", "epic": "Administración", "title": "Gestión de categorías indicadores y plantillas",
        "actor": "Administrador del Sistema", "priority": "Alta", "estimate": "6 días", "deps": "HU-05, HT-09",
        "story": "Como administrador del sistema quiero mantener categorías, indicadores y plantillas documentales para representar los numerales LOTAIP y los criterios analíticos del sistema.",
        "criteria": [
            "Los indicadores se asocian con una categoría, un código único y una plantilla cuando corresponde.",
            "La matriz normativa vigente muestra los 24 numerales y los 25 formatos oficiales utilizados por el motor LOTAIP.",
            "Una actualización normativa crea una nueva versión; no modifica resultados históricos ya calculados.",
            "Los criterios internacionales permanecen separados de las reglas y ponderaciones nacionales.",
        ],
    },
    {
        "id": "HU-07", "epic": "Administración", "title": "Configuración de ponderaciones",
        "actor": "Administrador del Sistema", "priority": "Media", "estimate": "4 días", "deps": "HU-06, HT-13",
        "story": "Como administrador del sistema quiero configurar ponderaciones analíticas para adaptar reportes y comparaciones sin alterar las fórmulas normativas versionadas.",
        "criteria": [
            "El sistema valida que las ponderaciones configurables sumen el total requerido.",
            "Los cambios registran usuario, fecha, valores anteriores y nuevos.",
            "La fórmula SITA y los máximos de OGP, OCDE y ODS 16 no pueden ser sobrescritos por una ponderación administrativa.",
            "Los reportes identifican la configuración aplicada a cada resultado.",
        ],
    },
    {
        "id": "HU-08", "epic": "Administración", "title": "Gestión de períodos de evaluación",
        "actor": "Administrador del Sistema", "priority": "Alta", "estimate": "3 días", "deps": "HT-02",
        "story": "Como administrador del sistema quiero abrir, cerrar y consultar períodos de evaluación para separar resultados por año y mes de transparencia.",
        "criteria": [
            "Un período define año, intervalo aplicable y estado.",
            "No se permiten períodos duplicados o rangos incoherentes.",
            "El cierre impide nuevas modificaciones ordinarias, pero conserva consultas y reportes.",
            "Evidencias, ejecuciones y resultados quedan vinculados al período correspondiente.",
        ],
    },
    {
        "id": "HU-09", "epic": "Gestión documental", "title": "Carga y clasificación de evidencias",
        "actor": "Administrador del Sistema y Administrador Universitario", "priority": "Muy alta", "estimate": "1 semana", "deps": "HU-05, HU-06, HU-08, HT-06",
        "story": "Como responsable institucional quiero cargar un archivo o registrar una URL y clasificarla por universidad, período, mes e indicador para que pueda ser evaluada.",
        "criteria": [
            "El formulario exige universidad, indicador, período, mes y al menos un archivo o URL.",
            "El sistema valida tipo, tamaño, nombre y disponibilidad básica antes de registrar la evidencia.",
            "La evidencia almacena procedencia, usuario responsable, fecha de carga y metadatos técnicos.",
            "Los formatos no permitidos y las asociaciones incompletas se rechazan con un mensaje específico.",
        ],
    },
    {
        "id": "HU-10", "epic": "Gestión documental", "title": "Extracción automática desde el portal DPE",
        "actor": "Administrador del Sistema", "priority": "Alta", "estimate": "1 semana", "deps": "HU-05, HU-08, HT-07",
        "story": "Como administrador del sistema quiero importar automáticamente los archivos publicados en el portal DPE para reducir la carga manual y conservar su procedencia.",
        "criteria": [
            "La extracción usa el identificador DPE, año y mes seleccionados.",
            "Cada archivo importado registra URL original, nombre, tipo documental, indicador y fecha de publicación disponible.",
            "Los duplicados se detectan antes de crear evidencias adicionales.",
            "Un fallo parcial informa qué elementos se importaron y cuáles requieren intervención.",
            "Las solicitudes remotas aplican tiempo límite, validación de destino y defensas contra SSRF.",
        ],
    },
    {
        "id": "HU-11", "epic": "Gestión documental", "title": "Consulta actualización y eliminación de evidencias",
        "actor": "Administrador del Sistema y Administrador Universitario", "priority": "Alta", "estimate": "5 días", "deps": "HU-09, HT-06",
        "story": "Como usuario autorizado quiero buscar, visualizar, descargar, reemplazar o eliminar evidencias para mantener actualizado el expediente de cada universidad.",
        "criteria": [
            "La lista permite filtrar por universidad, período, mes, indicador y estado de validación.",
            "La descarga conserva el nombre y tipo de archivo registrado.",
            "Un reemplazo invalida resultados anteriores que ya no correspondan con el contenido vigente.",
            "Las operaciones masivas requieren confirmación y respetan los permisos por rol e institución.",
            "La eliminación conserva el registro de auditoría necesario para trazabilidad.",
        ],
    },
    {
        "id": "HU-12", "epic": "Gestión documental", "title": "Procesamiento técnico de documentos",
        "actor": "Sistema", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HU-09, HT-08",
        "story": "Como sistema quiero extraer texto, tablas y metadatos de los documentos para alimentar validaciones reproducibles de estructura, período, contenido y accesibilidad.",
        "criteria": [
            "El procesador admite CSV, XLSX, XLS, ODS, PDF, DOCX, TXT y fuentes URL según configuración.",
            "Los documentos escaneados utilizan OCR dentro de los límites de páginas, caracteres y tiempo definidos.",
            "El resultado identifica extensión, hojas, columnas, filas, texto extraído, protección y corrupción.",
            "Un error técnico queda diferenciado del incumplimiento normativo y no se convierte automáticamente en cero.",
        ],
    },
    {
        "id": "HU-13", "epic": "Evaluación nacional", "title": "Evaluación automática LOTAIP",
        "actor": "Administrador del Sistema", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HU-12, HT-09, HT-10",
        "story": "Como administrador del sistema quiero ejecutar la evaluación automática LOTAIP para obtener el cumplimiento nacional de una universidad con evidencia verificable.",
        "criteria": [
            "El motor selecciona las reglas del numeral y la plantilla oficial correspondientes al período evaluado.",
            "La evaluación calcula CTA, ETA, RP y CI y presenta SITA mediante la fórmula definida.",
            "Los estados No aplica, Sin evaluación, Requiere revisión y Error técnico se tratan sin distorsionar el denominador.",
            "Cada criterio muestra calificación, regla aplicada, observación y comprobaciones que respaldan el resultado.",
            "El resultado conserva versión del motor y huella SHA-256 de la configuración normativa.",
        ],
    },
    {
        "id": "HU-14", "epic": "Evaluación nacional", "title": "Seguimiento cancelación y reintento de evaluaciones",
        "actor": "Administrador del Sistema", "priority": "Alta", "estimate": "5 días", "deps": "HU-13, HT-14",
        "story": "Como administrador del sistema quiero seguir el progreso, cancelar una ejecución y reintentar pendientes para controlar evaluaciones extensas sin duplicar procesos.",
        "criteria": [
            "Cada ejecución tiene identificador, estado, avance, totales, fechas y resumen de errores.",
            "La interfaz muestra progreso por documento y puede reconectarse a una ejecución en curso.",
            "La cancelación detiene trabajo pendiente y conserva los resultados finalizados.",
            "El reintento procesa solo elementos pendientes o con error técnico cuando la opción lo indique.",
        ],
    },
    {
        "id": "HU-15", "epic": "Evaluación nacional", "title": "Revisión manual de criterios ambiguos",
        "actor": "Administrador del Sistema y Auditor", "priority": "Alta", "estimate": "5 días", "deps": "HU-13, HT-11",
        "story": "Como revisor autorizado quiero aceptar o rechazar criterios ambiguos y registrar una observación para completar la evaluación sin perder el resultado automático original.",
        "criteria": [
            "Solo los roles autorizados pueden decidir elementos de la cola de revisión.",
            "La decisión exige criterio, Aceptar o Rechazar y una observación justificativa.",
            "El sistema conserva el resultado automático, la decisión manual, el usuario y la fecha.",
            "El resumen institucional se recalcula después de resolver los criterios pendientes.",
        ],
    },
    {
        "id": "HU-16", "epic": "Evaluación internacional", "title": "Evaluación con OGP OCDE y ODS 16",
        "actor": "Administrador del Sistema y Auditor", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HU-12, HU-13, HT-12",
        "story": "Como evaluador quiero medir apertura, calidad técnica, gobernanza y ODS 16 para complementar el cumplimiento nacional con criterios internacionales.",
        "criteria": [
            "OGP se calcula sobre 15 puntos mediante acceso abierto, oportunidad, comprensión, rendición de cuentas y reutilización ciudadana.",
            "OCDE se calcula sobre 20 puntos mediante calidad de datos, metadatos, diccionario de datos, interoperabilidad y comparabilidad.",
            "ODS 16 se calcula sobre 10 puntos mediante acceso público, institución transparente, rendición de cuentas e información verificable.",
            "Cada estándar presenta puntaje, máximo, porcentaje, criterios y observaciones.",
            "La evaluación internacional no modifica CTA, ETA, RP, CI ni SITA.",
        ],
    },
    {
        "id": "HU-17", "epic": "Índices", "title": "Cálculo de índices nacional internacional e integrado",
        "actor": "Sistema", "priority": "Muy alta", "estimate": "1 semana", "deps": "HU-13, HU-16, HT-13",
        "story": "Como sistema quiero consolidar los resultados nacionales e internacionales para publicar indicadores comparables por universidad y período.",
        "criteria": [
            "El índice nacional utiliza el SITA vigente y solo se presenta como definitivo cuando están resueltos sus componentes obligatorios.",
            "El índice internacional normaliza el puntaje obtenido sobre un máximo de 45 puntos.",
            "El índice integrado se calcula como (puntaje nacional + puntaje internacional) dividido entre 145 y expresado en porcentaje.",
            "Los documentos de diccionario se excluyen de la agregación cuando solo cumplen una función auxiliar.",
            "El resumen informa cobertura, pendientes, errores técnicos, mínimos y máximos provisionales cuando corresponda.",
        ],
    },
    {
        "id": "HU-18", "epic": "Resultados", "title": "Dashboard por perfil",
        "actor": "Todos los perfiles", "priority": "Alta", "estimate": "1 semana", "deps": "HU-17, HT-15, HT-16",
        "story": "Como usuario quiero visualizar un dashboard adaptado a mi rol para conocer el estado documental y los principales índices de transparencia.",
        "criteria": [
            "El panel muestra métricas reales y no sustituye datos ausentes por resultados ficticios.",
            "Los usuarios pueden seleccionar universidad y período dentro de su ámbito autorizado.",
            "El dashboard distingue LOTAIP, promedio internacional e índice integrado.",
            "Los estados de carga, ausencia de datos y error son visibles y comprensibles.",
        ],
    },
    {
        "id": "HU-19", "epic": "Resultados", "title": "Rankings de transparencia",
        "actor": "Todos los perfiles", "priority": "Alta", "estimate": "5 días", "deps": "HU-17, HT-16",
        "story": "Como usuario quiero consultar rankings por período para comparar el desempeño nacional e integrado de las universidades.",
        "criteria": [
            "El ranking ordena universidades con resultados válidos y muestra posición, SITA e índice integrado.",
            "Los empates usan una regla determinista documentada.",
            "Una universidad sin evaluación no recibe una puntuación cero automática ni altera el orden calculado.",
            "El usuario puede abrir el detalle de una universidad desde la clasificación.",
        ],
    },
    {
        "id": "HU-20", "epic": "Resultados", "title": "Comparación entre universidades",
        "actor": "Administrador Universitario y Auditor", "priority": "Media alta", "estimate": "5 días", "deps": "HU-17, HT-16",
        "story": "Como usuario analista quiero comparar universidades y períodos para identificar diferencias en cumplimiento nacional y criterios internacionales.",
        "criteria": [
            "La comparación usa la misma versión de fórmula y el mismo período o advierte la diferencia.",
            "Se muestran SITA, OGP, OCDE, ODS 16 e índice integrado.",
            "Los gráficos incluyen etiquetas y valores accesibles en tablas o texto equivalente.",
            "Los filtros sin resultados muestran un estado vacío y conservan los criterios seleccionados.",
        ],
    },
    {
        "id": "HU-21", "epic": "Resultados", "title": "Generación y exportación de reportes",
        "actor": "Todos los perfiles autorizados", "priority": "Media alta", "estimate": "1 semana", "deps": "HU-17, HT-16",
        "story": "Como usuario autorizado quiero generar reportes filtrados para documentar resultados, evidencias, observaciones e índices de transparencia.",
        "criteria": [
            "El reporte permite filtrar por universidad, período, categoría o indicador.",
            "Incluye la versión normativa, SITA, OGP, OCDE, ODS 16, índice integrado y observaciones aplicables.",
            "La exportación conserva títulos, unidades, fechas y procedencia de los datos.",
            "Si faltan datos, el sistema identifica la causa y no genera cifras aparentes.",
        ],
    },
    {
        "id": "HU-22", "epic": "Mejora", "title": "Observaciones y recomendaciones",
        "actor": "Administrador Universitario y Auditor", "priority": "Media alta", "estimate": "5 días", "deps": "HU-15, HU-17",
        "story": "Como responsable institucional quiero consultar observaciones y recomendaciones por evidencia para corregir incumplimientos y mejorar la publicación.",
        "criteria": [
            "Las observaciones se agrupan por universidad, período, indicador, documento y criterio.",
            "El responsable puede distinguir resultados automáticos, decisiones manuales y errores técnicos.",
            "Las recomendaciones se derivan de criterios no cumplidos o parciales y citan el aspecto que debe corregirse.",
            "La corrección de una evidencia permite solicitar una nueva evaluación sin borrar el historial anterior.",
        ],
    },
    {
        "id": "HU-23", "epic": "Mejora", "title": "Registro y atención de comentarios",
        "actor": "Administrador Universitario y Administrador del Sistema", "priority": "Media", "estimate": "4 días", "deps": "HU-02, HT-05",
        "story": "Como usuario institucional quiero enviar comentarios sobre transparencia y recibir seguimiento para comunicar incidencias o sugerencias de mejora.",
        "criteria": [
            "El formulario exige un mensaje no vacío y clasifica el tipo de comentario.",
            "El sistema registra usuario, rol, fecha, estado y respuesta cuando exista.",
            "El administrador puede filtrar, responder y cerrar comentarios.",
            "Las notificaciones no exponen direcciones ni datos sensibles a usuarios no autorizados.",
        ],
    },
    {
        "id": "HU-24", "epic": "Seguridad y trazabilidad", "title": "Consulta de auditoría y errores",
        "actor": "Administrador del Sistema", "priority": "Alta", "estimate": "5 días", "deps": "HT-05, HT-17",
        "story": "Como administrador del sistema quiero consultar acciones y errores auditados para investigar cambios, accesos y fallos de procesamiento.",
        "criteria": [
            "Los registros permiten filtrar por usuario, módulo, acción, resultado y fecha.",
            "Cada evento conserva una descripción útil, dirección de origen cuando proceda y referencia al objeto afectado.",
            "Los detalles técnicos visibles no incluyen contraseñas, tokens, claves ni contenido sensible innecesario.",
            "Solo el Administrador del Sistema puede consultar los registros completos.",
        ],
    },
]


TECH_STORIES = [
    {
        "id": "HT-01", "title": "Arquitectura y entornos del proyecto", "priority": "Muy alta", "estimate": "4 días", "deps": "Ninguna",
        "description": "Preparar la arquitectura React, Django y PostgreSQL, con configuración separada para desarrollo, pruebas y producción.",
        "acceptance": ["El frontend y el backend se ejecutan con comandos documentados.", "La configuración sensible se obtiene desde variables de entorno.", "Django verifica su configuración y React genera una compilación de producción.", "La estructura separa presentación, API, servicios, modelos y motores de evaluación."],
        "tasks": ["Configurar proyecto Django y aplicación principal.", "Configurar React, enrutamiento y cliente HTTP.", "Definir variables de entorno y archivos de ejemplo.", "Documentar instalación, migraciones y ejecución."],
        "tests": ["Arranque limpio del backend.", "Compilación del frontend.", "Comprobación de conexión con PostgreSQL."],
    },
    {
        "id": "HT-02", "title": "Modelo de datos y migraciones", "priority": "Muy alta", "estimate": "1 semana", "deps": "HT-01",
        "description": "Implementar el modelo relacional para usuarios, roles, universidades, categorías, indicadores, estándares, evidencias, períodos, evaluaciones, resultados, revisiones y auditoría.",
        "acceptance": ["Las relaciones y restricciones impiden referencias inválidas.", "Las migraciones crean y actualizan el esquema sin pérdida de datos.", "Los índices cubren filtros frecuentes por universidad, período, indicador y estado.", "Los datos históricos conservan versión y procedencia."],
        "tasks": ["Definir modelos y claves foráneas.", "Crear migraciones y datos iniciales de roles.", "Agregar índices y restricciones únicas.", "Preparar estrategia de respaldo y restauración."],
        "tests": ["Migración desde una base vacía.", "Pruebas de integridad referencial.", "Consulta de relaciones y eliminación protegida."],
    },
    {
        "id": "HT-03", "title": "Autenticación recuperación y segundo factor", "priority": "Muy alta", "estimate": "1 semana", "deps": "HT-01, HT-02",
        "description": "Implementar autenticación mediante JWT, hash seguro de contraseñas, segundo factor y tokens de recuperación de un solo uso.",
        "acceptance": ["Las contraseñas nunca se almacenan ni se registran en texto legible.", "Los tokens incluyen expiración y validación de integridad.", "El segundo factor bloquea el acceso hasta completar el desafío.", "La recuperación invalida tokens vencidos o utilizados."],
        "tasks": ["Implementar registro, login y verificación 2FA.", "Generar y validar JWT.", "Implementar solicitud y confirmación de recuperación.", "Aplicar límites de intentos y auditoría de acceso."],
        "tests": ["Login exitoso y fallido.", "Expiración y alteración de tokens.", "Cuenta inactiva y código 2FA incorrecto.", "Reutilización de token de recuperación."],
    },
    {
        "id": "HT-04", "title": "Control de acceso basado en roles", "priority": "Muy alta", "estimate": "4 días", "deps": "HT-03",
        "description": "Aplicar permisos coherentes en API y frontend para Administrador del Sistema, perfil institucional y Auditor.",
        "acceptance": ["Cada endpoint valida autenticación y roles permitidos.", "Las rutas protegidas redirigen al panel correcto.", "Ocultar una opción en la interfaz no reemplaza la autorización del backend.", "Las restricciones por universidad se aplican a consultas y mutaciones."],
        "tasks": ["Centralizar middleware y decoradores de autorización.", "Configurar rutas protegidas de React.", "Definir matriz rol por operación.", "Auditar intentos denegados relevantes."],
        "tests": ["Matriz de acceso para cada rol.", "Acceso cruzado a recursos de otra universidad.", "Token ausente, inválido y expirado."],
    },
    {
        "id": "HT-05", "title": "API REST y manejo uniforme de errores", "priority": "Alta", "estimate": "1 semana", "deps": "HT-02, HT-04",
        "description": "Construir endpoints JSON para los módulos del sistema con validación, códigos HTTP consistentes y trazabilidad de errores.",
        "acceptance": ["Las respuestas exitosas y de error mantienen un contrato documentado.", "Las operaciones CRUD validan campos y relaciones.", "Los errores esperados no exponen trazas internas.", "Las operaciones relevantes generan eventos de auditoría."],
        "tasks": ["Definir rutas y contratos.", "Implementar serialización y validaciones.", "Normalizar paginación, filtros y mensajes.", "Documentar endpoints y ejemplos."],
        "tests": ["Pruebas por endpoint y método.", "Payload inválido y recurso inexistente.", "Permisos insuficientes y concurrencia básica."],
    },
    {
        "id": "HT-06", "title": "Almacenamiento seguro de evidencias", "priority": "Muy alta", "estimate": "1 semana", "deps": "HT-02, HT-05",
        "description": "Implementar carga, consulta, actualización, descarga y eliminación controlada de archivos o URLs asociados a los ítems LOTAIP.",
        "acceptance": ["Se validan extensión, tamaño y nombre antes de guardar.", "Las rutas de archivo no permiten traversal ni ejecución.", "Los permisos se aplican a operaciones individuales y masivas.", "El registro conserva origen, metadatos y usuario responsable."],
        "tasks": ["Configurar almacenamiento de medios.", "Implementar endpoints multipart y URL.", "Calcular metadatos y huellas cuando corresponda.", "Implementar descarga y limpieza segura."],
        "tests": ["Carga válida e inválida.", "Archivo sobredimensionado y nombre malicioso.", "Descarga autorizada y denegada.", "Actualización y eliminación masiva."],
    },
    {
        "id": "HT-07", "title": "Conector con el portal DPE", "priority": "Alta", "estimate": "2 semanas", "deps": "HT-05, HT-06",
        "description": "Obtener el inventario público de transparencia y registrar las evidencias disponibles por institución, período, mes y numeral.",
        "acceptance": ["El conector identifica la entidad mediante el ID DPE configurado.", "Las descargas conservan URL original y datos de publicación.", "Los duplicados y respuestas parciales se manejan de forma idempotente.", "Las solicitudes tienen tiempo límite, tamaño máximo y validación de destino."],
        "tasks": ["Implementar consulta del inventario público.", "Mapear nombres y numerales a indicadores.", "Descargar y clasificar archivos permitidos.", "Registrar resumen de importación y fallos."],
        "tests": ["Respuesta completa y vacía.", "Duplicados.", "Timeout y código HTTP inválido.", "Destino privado o redirección insegura."],
    },
    {
        "id": "HT-08", "title": "Procesamiento de documentos y OCR", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HT-06",
        "description": "Extraer contenido y metadatos de archivos tabulares y documentos, con OCR para contenido escaneado y límites de recursos.",
        "acceptance": ["CSV, hojas de cálculo, PDF, DOCX y TXT producen una salida normalizada.", "El OCR se activa cuando el documento no contiene texto suficiente.", "Los límites de páginas, caracteres y tiempo evitan procesos sin control.", "Los fallos se clasifican como errores técnicos y conservan diagnóstico seguro."],
        "tasks": ["Implementar detectores de tipo documental.", "Extraer hojas, columnas, filas, texto y metadatos.", "Integrar OCR con muestreo reproducible.", "Normalizar tildes, espacios, mayúsculas y encabezados."],
        "tests": ["Archivo válido por tipo.", "Documento escaneado.", "Archivo protegido o corrupto.", "Documento grande y tiempo límite."],
    },
    {
        "id": "HT-09", "title": "Configuración normativa LOTAIP versionada", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HT-02, HT-08",
        "description": "Modelar la Resolución 053-DPE-CGAJ-2024 mediante una matriz central de aplicabilidad, 24 numerales y 25 formatos oficiales.",
        "acceptance": ["Cada numeral selecciona sus formatos, campos y verificaciones aplicables.", "Las columnas se comparan por nombre normalizado y no por posición.", "Los campos faltantes generan un error identificable y las columnas extra solo una advertencia.", "La versión y la huella SHA-256 de la configuración se guardan con el resultado."],
        "tasks": ["Mantener reglas, esquemas y plantillas oficiales.", "Implementar resolución de numeral y formato.", "Registrar fuente normativa y versión.", "Proteger evaluaciones históricas frente a cambios."],
        "tests": ["Matriz completa de 24 numerales.", "Esquema correcto e incorrecto.", "Campos adicionales.", "Reproducción con la misma versión."],
    },
    {
        "id": "HT-10", "title": "Motor de puntuación nacional SITA", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HT-09",
        "description": "Calcular Información completa y actualizada CTA, Estructura de datos abiertos ETA, Registro dentro del plazo RP, Calidad de información CI y el índice SITA.",
        "acceptance": ["SITA se calcula como el promedio de CTA, ETA, RP y CI.", "Los criterios no aplicables y sin evaluación se excluyen según la regla normativa.", "Los pendientes producen estado provisional y límites mínimo y máximo.", "Un error técnico no se interpreta como incumplimiento."],
        "tasks": ["Implementar reglas CTA, ETA y RP.", "Evaluar verificables, vigencia y validez para CI.", "Agregar resultados por formato y universidad.", "Exponer cobertura y estados provisionales."],
        "tests": ["Cálculo completo.", "No aplica justificado.", "Criterio pendiente.", "Error técnico.", "SITA provisional y definitivo."],
    },
    {
        "id": "HT-11", "title": "Verificación semántica y revisión humana", "priority": "Alta", "estimate": "2 semanas", "deps": "HT-08, HT-10",
        "description": "Resolver correspondencia semántica cuando las reglas deterministas no sean suficientes y enviar casos ambiguos a una cola de revisión auditada.",
        "acceptance": ["La verificación usa únicamente contenido permitido y limita longitud y tiempo.", "Una respuesta no válida del proveedor no asigna una calificación arbitraria.", "Los casos ambiguos quedan como Requiere revisión.", "La decisión humana conserva el resultado automático y su evidencia."],
        "tasks": ["Definir contrato de verificación semántica.", "Sanitizar y limitar el contexto enviado.", "Implementar cola y endpoint de decisión.", "Recalcular resúmenes después de la revisión."],
        "tests": ["Coincidencia determinista.", "Respuesta semántica válida e inválida.", "Timeout.", "Aceptación y rechazo auditados."],
    },
    {
        "id": "HT-12", "title": "Motor de criterios internacionales", "priority": "Muy alta", "estimate": "2 semanas", "deps": "HT-08, HT-10",
        "description": "Implementar una segunda capa de evaluación para OGP, OCDE y ODS 16 que mida apertura, calidad técnica, gobernanza y verificabilidad sin repetir la existencia del literal LOTAIP.",
        "acceptance": ["OGP suma hasta 15 puntos en cinco criterios de 3 puntos.", "OCDE suma hasta 20 puntos en cinco criterios de 4 puntos.", "ODS 16 suma hasta 10 puntos mediante criterios de 3, 3, 2 y 2 puntos.", "Cada criterio devuelve puntaje, máximo y observación comprobable.", "El motor internacional no altera la calificación SITA."],
        "tasks": ["Implementar acceso abierto, oportunidad, comprensión, rendición y reutilización.", "Implementar calidad, metadatos, diccionario, interoperabilidad y comparabilidad.", "Implementar acceso público, institución transparente e información verificable.", "Persistir el resultado internacional junto al resultado documental."],
        "tests": ["Puntaje máximo y parcial por estándar.", "Documento tabular y documento solo legible.", "Metadatos o diccionario complementarios.", "Fuente inaccesible o protegida."],
    },
    {
        "id": "HT-13", "title": "Agregación de índices y versionado de resultados", "priority": "Muy alta", "estimate": "1 semana", "deps": "HT-10, HT-12",
        "description": "Consolidar resultados documentales en índices institucionales nacional, internacional e integrado, preservando fórmula y versión.",
        "acceptance": ["El índice internacional normaliza el promedio sobre 45 puntos.", "El índice integrado usa el total nacional e internacional sobre 145 puntos.", "Los auxiliares documentales no inflan el número de evidencias evaluadas.", "Cada resumen identifica período, cobertura, versión y estado provisional o definitivo."],
        "tasks": ["Implementar agregación por universidad y período.", "Persistir resúmenes institucionales.", "Invalidar resúmenes cuando cambia una evidencia.", "Exponer índices mediante API."],
        "tests": ["Agregación vacía y completa.", "Documentos auxiliares.", "Resultado provisional.", "Reevaluación e invalidación de caché."],
    },
    {
        "id": "HT-14", "title": "Orquestación de evaluaciones extensas", "priority": "Alta", "estimate": "1 semana", "deps": "HT-10, HT-11, HT-13",
        "description": "Gestionar ejecuciones por universidad con progreso persistido, transmisión de eventos, cancelación y reintento selectivo.",
        "acceptance": ["Una solicitud devuelve un identificador de ejecución reutilizable.", "El estado persiste totales, avance, errores y fechas.", "La cancelación es cooperativa y no revierte resultados ya guardados.", "La reconexión evita iniciar una segunda evaluación equivalente."],
        "tasks": ["Crear modelo y estados de ejecución.", "Emitir progreso mediante NDJSON.", "Implementar consulta, cancelación y reintento.", "Coordinar transacciones y exclusión de duplicados."],
        "tests": ["Ejecución completa.", "Reconexión.", "Cancelación.", "Error parcial y reintento.", "Solicitud duplicada concurrente."],
    },
    {
        "id": "HT-15", "title": "Interfaz React accesible y adaptable", "priority": "Alta", "estimate": "2 semanas", "deps": "HT-04, HT-05",
        "description": "Construir paneles por rol, formularios, tablas y estados de interacción con navegación coherente en navegadores modernos.",
        "acceptance": ["Cada rol observa únicamente su menú autorizado.", "Los formularios muestran errores asociados al campo y conservan datos corregibles.", "Las vistas funcionan en escritorio y resoluciones reducidas.", "Controles, tablas y gráficos mantienen etiquetas, contraste y navegación por teclado."],
        "tasks": ["Crear layout y componentes reutilizables.", "Implementar rutas protegidas.", "Conectar servicios de API.", "Aplicar estados de carga, vacío, error y confirmación."],
        "tests": ["Navegación por rol.", "Formularios y modales.", "Vista adaptable.", "Pruebas de componentes críticos."],
    },
    {
        "id": "HT-16", "title": "Dashboards comparativas rankings y reportes", "priority": "Alta", "estimate": "2 semanas", "deps": "HT-13, HT-15",
        "description": "Presentar resultados reales mediante métricas, gráficos, tablas, rankings, comparaciones y exportaciones filtradas.",
        "acceptance": ["Los componentes distinguen SITA, OGP, OCDE, ODS 16 e índice integrado.", "Todos los gráficos tienen una alternativa textual o tabular.", "Los filtros usan períodos y universidades válidos.", "Los reportes identifican fecha, alcance, fórmula y versión de evaluación."],
        "tasks": ["Crear endpoints agregados.", "Implementar visualizaciones y tarjetas de puntuación.", "Construir ranking y comparador.", "Generar reportes imprimibles y exportables."],
        "tests": ["Datos completos y vacíos.", "Filtros.", "Orden de ranking.", "Contenido y formato de exportación."],
    },
    {
        "id": "HT-17", "title": "Seguridad auditoría y protección operativa", "priority": "Muy alta", "estimate": "1 semana", "deps": "HT-03, HT-04, HT-05, HT-06",
        "description": "Aplicar validación de entradas, protección de datos, auditoría, manejo de secretos, HTTPS y defensas para archivos y conexiones remotas.",
        "acceptance": ["Las consultas usan el ORM o parámetros y las salidas se escapan en la interfaz.", "Las conexiones remotas bloquean destinos locales o no permitidos y controlan redirecciones.", "Los registros excluyen secretos y datos sensibles innecesarios.", "Producción aplica HTTPS, encabezados de seguridad y configuración segura de cookies o tokens."],
        "tasks": ["Revisar validaciones y permisos.", "Aplicar defensas XSS, inyección y SSRF.", "Centralizar auditoría y errores.", "Definir rotación de secretos y respuesta a incidentes."],
        "tests": ["Payloads maliciosos.", "Acceso horizontal y vertical.", "Destino SSRF.", "Exposición de secretos en logs y respuestas."],
    },
    {
        "id": "HT-18", "title": "Pruebas despliegue y continuidad", "priority": "Muy alta", "estimate": "2 semanas", "deps": "Todas las anteriores",
        "description": "Automatizar pruebas, comprobaciones de calidad, despliegue reproducible, respaldo y monitoreo básico del sistema completo.",
        "acceptance": ["Las pruebas unitarias e integradas cubren motores, permisos y flujos principales.", "La compilación y las migraciones se verifican antes de desplegar.", "Existe un procedimiento probado de respaldo y restauración.", "Los fallos operativos generan registros suficientes para diagnóstico sin exponer secretos."],
        "tasks": ["Crear suites backend y frontend.", "Definir datos de prueba reproducibles.", "Configurar pipeline de calidad y despliegue.", "Documentar respaldo, restauración, monitoreo y reversión."],
        "tests": ["Ejecución completa de suites.", "Despliegue en entorno limpio.", "Restauración de respaldo.", "Prueba de humo posterior al despliegue."],
    },
]


TRACEABILITY = [
    ("HU-01", "Registro de auditor", "HT-03, HT-04, HT-05"),
    ("HU-02", "Autenticación y 2FA", "HT-03, HT-04"),
    ("HU-03", "Recuperación de contraseña", "HT-03, HT-05"),
    ("HU-04", "Usuarios roles y estados", "HT-02, HT-04, HT-05, HT-17"),
    ("HU-05", "Universidades", "HT-02, HT-05, HT-15"),
    ("HU-06", "Categorías indicadores y plantillas", "HT-02, HT-09"),
    ("HU-07", "Ponderaciones", "HT-05, HT-13"),
    ("HU-08", "Períodos", "HT-02, HT-05"),
    ("HU-09", "Carga de evidencias", "HT-06, HT-08"),
    ("HU-10", "Extracción DPE", "HT-07, HT-17"),
    ("HU-11", "Gestión de evidencias", "HT-05, HT-06"),
    ("HU-12", "Procesamiento documental", "HT-08, HT-17"),
    ("HU-13", "Evaluación LOTAIP", "HT-09, HT-10"),
    ("HU-14", "Control de ejecuciones", "HT-14"),
    ("HU-15", "Revisión manual", "HT-11, HT-17"),
    ("HU-16", "Evaluación internacional", "HT-12"),
    ("HU-17", "Índices", "HT-10, HT-12, HT-13"),
    ("HU-18", "Dashboard", "HT-15, HT-16"),
    ("HU-19", "Rankings", "HT-13, HT-16"),
    ("HU-20", "Comparativas", "HT-13, HT-16"),
    ("HU-21", "Reportes", "HT-13, HT-16"),
    ("HU-22", "Observaciones", "HT-11, HT-15"),
    ("HU-23", "Comentarios", "HT-05, HT-15"),
    ("HU-24", "Auditoría", "HT-05, HT-17, HT-18"),
]


SPRINTS = [
    ("Sprint 1", "Base técnica", "HT-01, HT-02", "Arquitectura, base de datos y migraciones reproducibles"),
    ("Sprint 2", "Acceso seguro", "HT-03, HT-04; HU-01 a HU-03", "Registro, JWT, 2FA, recuperación y permisos"),
    ("Sprint 3", "Administración", "HT-05, HT-15; HU-04 a HU-08", "Usuarios, universidades, catálogo y períodos"),
    ("Sprint 4", "Gestión documental", "HT-06, HT-08; HU-09, HU-11, HU-12", "Carga, almacenamiento y procesamiento de evidencias"),
    ("Sprint 5", "Integración DPE", "HT-07, HT-17; HU-10", "Extracción segura e idempotente desde el portal DPE"),
    ("Sprint 6", "Motor LOTAIP", "HT-09, HT-10; HU-13", "Matriz normativa, CTA, ETA, RP, CI y SITA"),
    ("Sprint 7", "Operación y revisión", "HT-11, HT-14; HU-14, HU-15", "Progreso, cancelación, reintento y revisión humana"),
    ("Sprint 8", "Criterios internacionales", "HT-12, HT-13; HU-16, HU-17", "OGP, OCDE, ODS 16 e índice integrado"),
    ("Sprint 9", "Resultados", "HT-16; HU-18 a HU-22", "Dashboards, rankings, comparativas, reportes y recomendaciones"),
    ("Sprint 10", "Cierre y calidad", "HT-18; HU-23, HU-24", "Feedback, auditoría, pruebas, despliegue y continuidad"),
]


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=110, bottom=100, end=110) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_row_cant_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant = OxmlElement("w:cantSplit")
    tr_pr.append(cant)


def set_table_borders(table, color=GRAY, size="6") -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = borders.find(qn(f"w:{edge}"))
        if el is None:
            el = OxmlElement(f"w:{edge}")
            borders.append(el)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), size)
        el.set(qn("w:color"), color)


def set_col_widths(table, widths_cm):
    for row in table.rows:
        for idx, width in enumerate(widths_cm):
            if idx < len(row.cells):
                row.cells[idx].width = Cm(width)


def style_run(run, size=None, bold=None, color=BLACK, italic=None):
    run.font.name = "Arial"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Arial")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Arial")
    run.font.color.rgb = color
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def add_field(paragraph, instruction: str) -> None:
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char1, instr, fld_char2])


def configure_document(doc: Document) -> None:
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.35)
    section.right_margin = Cm(2.15)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = BLACK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.12

    title = styles["Title"]
    title.font.name = "Arial"
    title._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    title._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    title.font.size = Pt(24)
    title.font.bold = True
    title.font.color.rgb = BLACK
    title.paragraph_format.space_after = Pt(12)
    title_ppr = title._element.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)

    for style_name, size, before, after in (
        ("Heading 1", 16, 16, 8),
        ("Heading 2", 13, 12, 6),
        ("Heading 3", 11, 9, 4),
    ):
        style = styles[style_name]
        style.font.name = "Arial"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = BLACK
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("SisTransp  |  Historias de usuario e historias técnicas  |  ")
    style_run(r, size=8, color=RGBColor(89, 89, 89))
    add_field(p, "PAGE")


def add_cover(doc: Document) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run("ESCUELA SUPERIOR POLITÉCNICA DE CHIMBORAZO")
    style_run(r, size=13, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("FACULTAD DE INFORMÁTICA Y ELECTRÓNICA")
    style_run(r, size=12, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("CARRERA DE SOFTWARE")
    style_run(r, size=12, bold=True)

    for _ in range(5):
        doc.add_paragraph()

    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run("Historias de usuario e historias técnicas del sistema")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Aplicación web para evaluar la transparencia institucional en universidades públicas basada en la LOTAIP y criterios internacionales")
    style_run(r, size=14, bold=True)

    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Documento actualizado para la implementación integral de SisTransp")
    style_run(r, size=11, italic=True, color=RGBColor(70, 70, 70))

    for _ in range(4):
        doc.add_paragraph()

    for label, value in (
        ("Autor", "Emilio Josué Pesántez Sánchez"),
        ("Tipo de documento", "Backlog funcional y técnico"),
        ("Versión", "2.0"),
        ("Fecha", "Octubre de 2026"),
    ):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(f"{label}: ")
        style_run(r, size=10.5, bold=True)
        r = p.add_run(value)
        style_run(r, size=10.5)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(26)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Riobamba Ecuador")
    style_run(r, size=10)
    doc.add_page_break()


def add_metadata_table(doc: Document) -> None:
    table = doc.add_table(rows=5, cols=2)
    table.alignment = WD_ALIGN_PARAGRAPH.CENTER
    table.autofit = False
    rows = (
        ("Proyecto", "Desarrollo de una aplicación web para evaluar la transparencia institucional en universidades públicas basado en la LOTAIP y criterios internacionales"),
        ("Producto", "SisTransp"),
        ("Alcance", "Sistema completo de administración, gestión documental, evaluación nacional e internacional, análisis y auditoría"),
        ("Perfiles funcionales", "Administrador del Sistema, perfil institucional y Auditor"),
        ("Tecnologías base", "React, Django, Python y PostgreSQL"),
    )
    for i, (label, value) in enumerate(rows):
        cells = table.rows[i].cells
        cells[0].text = label
        cells[1].text = value
        set_cell_shading(cells[0], BLUE)
        for cell in cells:
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in cell.paragraphs:
                for run in p.runs:
                    style_run(run, size=9.5, bold=(cell is cells[0]))
    set_col_widths(table, (4.2, 11.8))
    set_table_borders(table)


def add_bullet(doc: Document, text: str, level: int = 0) -> None:
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    style_run(r, size=10)


def add_user_story(doc: Document, item: dict) -> None:
    heading = doc.add_paragraph(style="Heading 2")
    heading.add_run(f"{item['id']}  {item['title']}")

    table = doc.add_table(rows=2, cols=4)
    table.autofit = False
    table.alignment = WD_ALIGN_PARAGRAPH.CENTER
    values = (
        ("Épica", item["epic"], "Actor", item["actor"]),
        ("Prioridad", item["priority"], "Estimación y dependencias", f"{item['estimate']}  |  {item['deps']}"),
    )
    for ridx, row_values in enumerate(values):
        row = table.rows[ridx]
        set_row_cant_split(row)
        for cidx, value in enumerate(row_values):
            cell = row.cells[cidx]
            cell.text = value
            set_cell_margins(cell, top=70, bottom=70)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if cidx in (0, 2):
                set_cell_shading(cell, BLUE)
            for p in cell.paragraphs:
                for run in p.runs:
                    style_run(run, size=8.7, bold=(cidx in (0, 2)))
    set_col_widths(table, (2.1, 4.8, 3.4, 5.7))
    set_table_borders(table)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(item["story"])
    style_run(r, size=10.5, italic=True)

    p = doc.add_paragraph(style="Heading 3")
    p.add_run("Criterios de aceptación")
    for criterion in item["criteria"]:
        add_bullet(doc, criterion)


def add_tech_story(doc: Document, item: dict) -> None:
    heading = doc.add_paragraph(style="Heading 2")
    heading.add_run(f"{item['id']}  {item['title']}")

    table = doc.add_table(rows=2, cols=4)
    table.autofit = False
    table.alignment = WD_ALIGN_PARAGRAPH.CENTER
    values = (
        ("Prioridad", item["priority"], "Estimación", item["estimate"]),
        ("Dependencias", item["deps"], "Tipo", "Historia técnica"),
    )
    for ridx, row_values in enumerate(values):
        row = table.rows[ridx]
        set_row_cant_split(row)
        for cidx, value in enumerate(row_values):
            cell = row.cells[cidx]
            cell.text = value
            set_cell_margins(cell, top=70, bottom=70)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if cidx in (0, 2):
                set_cell_shading(cell, BLUE)
            for p in cell.paragraphs:
                for run in p.runs:
                    style_run(run, size=8.7, bold=(cidx in (0, 2)))
    set_col_widths(table, (2.6, 5.1, 2.6, 5.7))
    set_table_borders(table)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(5)
    r = p.add_run(item["description"])
    style_run(r, size=10.5)

    for title, rows in (("Criterios de aceptación", item["acceptance"]), ("Tareas", item["tasks"]), ("Pruebas", item["tests"])):
        p = doc.add_paragraph(style="Heading 3")
        p.add_run(title)
        for text in rows:
            add_bullet(doc, text)


def add_matrix_table(doc: Document, headers, rows, widths):
    table = doc.add_table(rows=1, cols=len(headers))
    table.autofit = False
    table.alignment = WD_ALIGN_PARAGRAPH.CENTER
    header = table.rows[0]
    set_repeat_table_header(header)
    for i, value in enumerate(headers):
        cell = header.cells[i]
        cell.text = value
        set_cell_shading(cell, NAVY)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in p.runs:
                style_run(run, size=8.5, bold=True, color=RGBColor(255, 255, 255))
    for ridx, values in enumerate(rows):
        row = table.add_row()
        set_row_cant_split(row)
        for cidx, value in enumerate(values):
            cell = row.cells[cidx]
            cell.text = str(value)
            if ridx % 2:
                set_cell_shading(cell, PALE)
            set_cell_margins(cell, top=85, bottom=85)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if cidx == 0 else WD_ALIGN_PARAGRAPH.LEFT
                for run in p.runs:
                    style_run(run, size=8.5, bold=(cidx == 0))
    set_col_widths(table, widths)
    set_table_borders(table)
    return table


def build_document() -> Document:
    doc = Document()
    configure_document(doc)
    add_cover(doc)

    doc.add_heading("Propósito y alcance", level=1)
    p = doc.add_paragraph()
    p.add_run(
        "Este documento define el backlog funcional y técnico necesario para implementar y mantener SisTransp como una aplicación completa de evaluación de transparencia universitaria. "
        "Incluye administración, seguridad, gestión documental, evaluación LOTAIP, criterios internacionales, índices, dashboards, reportes, retroalimentación y auditoría. "
        "Las historias se redactan con criterios verificables para que sirvan como base de planificación, desarrollo, pruebas y trazabilidad académica."
    )
    add_metadata_table(doc)

    doc.add_heading("Perfiles funcionales", level=1)
    p = doc.add_paragraph()
    p.add_run(
        "La aplicación presenta tres paneles funcionales. El perfil institucional agrupa al Administrador Universitario y al Responsable de Unidad cuando ambos comparten navegación y permisos operativos. "
        "La autorización final siempre debe aplicarse en el backend, aunque una función no se muestre en la interfaz."
    )
    role_rows = [
        ("Administrador del Sistema", "Administra usuarios, universidades, configuración, evidencias, evaluaciones, reportes, comentarios y auditoría."),
        ("Perfil institucional", "Carga y mantiene evidencias de su institución, consulta resultados, comentarios y observaciones. Incluye Administrador Universitario y Responsable de Unidad."),
        ("Auditor", "Consulta evidencias y resultados, compara universidades y participa en revisiones autorizadas sin administrar la configuración general."),
    ]
    add_matrix_table(doc, ("Perfil", "Responsabilidad principal"), role_rows, (4.7, 11.3))

    doc.add_heading("Criterios de evaluación del sistema", level=1)
    doc.add_heading("Evaluación nacional LOTAIP", level=2)
    p = doc.add_paragraph()
    p.add_run(
        "El motor nacional se basa en la Resolución 053-DPE-CGAJ-2024 y procesa los numerales y formatos aplicables. "
        "El índice SITA se obtiene con la fórmula SITA = (CTA + ETA + RP + CI) / 4, donde CTA corresponde a información completa y actualizada, ETA a estructura de datos abiertos, RP al registro dentro del plazo y CI a la calidad de la información verificable."
    )
    doc.add_heading("Evaluación internacional", level=2)
    international_rows = [
        ("OGP", "15", "Acceso abierto, información oportuna, información comprensible, rendición de cuentas y reutilización ciudadana"),
        ("OCDE", "20", "Calidad de datos, metadatos, diccionario de datos, interoperabilidad y comparabilidad"),
        ("ODS 16", "10", "Acceso público, institución transparente, rendición de cuentas e información verificable"),
    ]
    add_matrix_table(doc, ("Marco", "Puntaje máximo", "Criterios"), international_rows, (2.7, 3.0, 10.3))
    p = doc.add_paragraph()
    p.add_run(
        "El índice internacional normaliza el total obtenido sobre 45 puntos. El índice integrado combina el puntaje nacional sobre 100 y el internacional sobre 45 mediante la expresión (nacional + internacional) / 145 × 100. "
        "Esta capa complementa la evaluación LOTAIP y no cambia la fórmula SITA."
    )

    doc.add_heading("Contenido", level=1)
    for text in (
        "1  Propósito alcance perfiles y criterios",
        "2  Historias de usuario HU-01 a HU-24",
        "3  Historias técnicas HT-01 a HT-18",
        "4  Matriz de trazabilidad",
        "5  Backlog de implementación por sprints",
        "6  Definición de terminado",
        "7  Riesgos y supuestos",
        "8  Referencias",
    ):
        add_bullet(doc, text)
    doc.add_page_break()

    doc.add_heading("Historias de usuario", level=1)
    p = doc.add_paragraph()
    p.add_run(
        "Cada historia expresa una necesidad observable desde el punto de vista del actor. La prioridad orienta la secuencia del backlog y la estimación representa esfuerzo de desarrollo y pruebas, no una fecha contractual."
    )
    for item in USER_STORIES:
        add_user_story(doc, item)

    doc.add_page_break()
    doc.add_heading("Historias técnicas", level=1)
    p = doc.add_paragraph()
    p.add_run(
        "Las historias técnicas describen capacidades internas necesarias para sostener las historias de usuario. Incluyen arquitectura, procesamiento, seguridad, motores de evaluación, interfaz, pruebas y operación."
    )
    for item in TECH_STORIES:
        add_tech_story(doc, item)

    doc.add_page_break()
    doc.add_heading("Matriz de trazabilidad", level=1)
    p = doc.add_paragraph()
    p.add_run("La matriz relaciona cada necesidad funcional con las historias técnicas que permiten implementarla y verificarla.")
    add_matrix_table(doc, ("Historia", "Capacidad funcional", "Historias técnicas relacionadas"), TRACEABILITY, (2.2, 6.1, 7.7))

    doc.add_heading("Backlog de implementación por sprints", level=1)
    p = doc.add_paragraph()
    p.add_run(
        "La secuencia propuesta prioriza dependencias técnicas antes de los módulos que las consumen. Cada sprint debe cerrar con pruebas ejecutables y una demostración de las historias terminadas."
    )
    add_matrix_table(doc, ("Sprint", "Objetivo", "Historias", "Resultado verificable"), SPRINTS, (2.0, 3.6, 4.7, 5.7))

    doc.add_heading("Definición de terminado", level=1)
    done_items = [
        "Los criterios de aceptación de la historia están automatizados o documentados como pruebas reproducibles.",
        "El control de acceso se verificó en el backend y en la interfaz para los perfiles aplicables.",
        "Las migraciones, contratos API y documentación técnica están actualizados.",
        "No existen errores críticos conocidos ni datos de prueba incrustados en los resultados presentados.",
        "Los mensajes de carga, error, vacío y confirmación son comprensibles.",
        "La funcionalidad se revisó en Chrome, Edge y Firefox en resoluciones de escritorio y reducidas.",
        "Los cambios de fórmulas o reglas conservan versión y no alteran evaluaciones históricas.",
        "Los registros y respuestas no exponen contraseñas, tokens, claves ni información sensible innecesaria.",
        "El código supera las pruebas acordadas y la compilación de producción.",
    ]
    for item in done_items:
        add_bullet(doc, item)

    doc.add_heading("Riesgos y supuestos", level=1)
    risk_rows = [
        ("Disponibilidad de fuentes externas", "El portal DPE y los enlaces publicados pueden fallar o cambiar.", "Registrar error técnico, aplicar límites y permitir reintento sin asignar cero automático."),
        ("Calidad documental", "Archivos escaneados, protegidos o mal estructurados reducen la extracción automática.", "Aplicar OCR, diagnóstico técnico y revisión humana cuando sea necesario."),
        ("Cambios normativos", "La matriz LOTAIP puede actualizarse.", "Crear una nueva versión de reglas y conservar la versión usada en resultados anteriores."),
        ("Interpretación internacional", "OGP, OCDE y ODS 16 son marcos amplios.", "Mantener criterios operativos explícitos, puntajes visibles y revisión metodológica."),
        ("Seguridad de enlaces", "Una URL suministrada por un usuario puede apuntar a redes internas o contenido riesgoso.", "Bloquear destinos privados, controlar redirecciones, tamaños, tipos y tiempos."),
        ("Comparabilidad", "Resultados de períodos o versiones diferentes pueden no ser directamente comparables.", "Advertir diferencias y filtrar por período y versión equivalentes."),
    ]
    add_matrix_table(doc, ("Riesgo", "Efecto", "Tratamiento"), risk_rows, (3.4, 5.4, 7.2))

    doc.add_heading("Referencias", level=1)
    references = [
        "Especificación de requisitos de software del proyecto, revisión 1, marzo de 2026.",
        "Especificación de casos de uso del proyecto, 31 de marzo de 2026.",
        "Historias de usuario e historias técnicas del proyecto, versión académica inicial, abril de 2026.",
        "Resolución 053-DPE-CGAJ-2024 y formatos oficiales utilizados por el motor LOTAIP.",
        "Documentación interna del motor LOTAIP y matriz de esquemas 2024 del repositorio SisTransp.",
        "Implementación actual de los módulos backend y frontend del repositorio SisTransp.",
    ]
    for ref in references:
        add_bullet(doc, ref)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Fin del documento")
    style_run(r, size=9, italic=True, color=RGBColor(89, 89, 89))

    return doc


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = build_document()
    doc.core_properties.title = "Historias de usuario e historias técnicas del sistema SisTransp"
    doc.core_properties.subject = "Backlog funcional y técnico para LOTAIP y criterios internacionales"
    doc.core_properties.author = "Emilio Josué Pesántez Sánchez"
    doc.core_properties.keywords = "SisTransp, LOTAIP, OGP, OCDE, ODS 16, historias de usuario, historias técnicas"
    doc.save(OUT_PATH)
    print(OUT_PATH)


if __name__ == "__main__":
    main()
