"""Catálogo metodológico del ITI: 58 indicadores en ocho dimensiones."""

DIMENSIONS = [
    ("D1", "Gobierno e información institucional", "Estructura, identidad, autoridades, órganos colegiados y entidades vinculadas."),
    ("D2", "Planificación, integridad y rendición de cuentas", "Planes, rendición de cuentas, integridad, sostenibilidad y compromisos de servicio."),
    ("D3", "Personal y gestión de talento humano", "Directorio, remuneraciones, relaciones laborales, selección y perfil del personal."),
    ("D4", "Estudiantes, oferta y servicios universitarios", "Oferta académica, admisiones, ayudas, orientación y derechos estudiantiles."),
    ("D5", "Gestión económica, financiera y contratación", "Presupuesto, auditorías, contratación, deuda, estados financieros y patrimonio."),
    ("D6", "Resultados académicos, investigación y vinculación", "Investigación, rendimiento, satisfacción, empleabilidad y financiación científica."),
    ("D7", "Participación, colaboración y acceso a la información", "Acceso a información, participación, peticiones, diálogo y seguimiento."),
    ("D8", "Transparencia digital, accesibilidad y datos abiertos", "Accesibilidad, históricos, interoperabilidad y datos abiertos."),
]


# código, dimensión, clasificación, familia, enunciado
INDICATORS = [
    ("IND-01", "D1", "NACIONAL", "CN-01", "La universidad publica su estructura orgánica funcional, base legal, regulaciones, procedimientos internos, metas y objetivos institucionales."),
    ("IND-02", "D1", "MIXTO", "CI-01", "La universidad publica su misión, visión e información histórica institucional, como complemento a los objetivos ya exigidos por la normativa nacional."),
    ("IND-03", "D1", "MIXTO", "CI-03", "La universidad publica el perfil académico o profesional y los medios institucionales de contacto de sus principales autoridades."),
    ("IND-04", "D1", "MIXTO", "CI-04", "La universidad publica la composición, competencias, reglamentos y actas o acuerdos de sus principales órganos colegiados."),
    ("IND-05", "D1", "MIXTO", "CI-05", "La universidad mantiene disponible un repositorio público de acuerdos y resoluciones institucionales relevantes."),
    ("IND-06", "D1", "INTERNACIONAL", "CI-06", "La universidad identifica y publica las entidades dependientes, participadas, fundaciones, empresas u otras organizaciones vinculadas institucionalmente."),
    ("IND-07", "D2", "NACIONAL", "CN-10", "La universidad publica los planes y programas institucionales que se encuentran en ejecución."),
    ("IND-08", "D2", "NACIONAL", "CN-12", "La universidad publica los mecanismos, informes e información correspondiente a la rendición de cuentas institucional."),
    ("IND-09", "D2", "NACIONAL", "CN-19", "La universidad publica la información correspondiente a donativos oficiales y protocolares recibidos."),
    ("IND-10", "D2", "NACIONAL", "CN-21", "La universidad publica las políticas públicas o información institucional que afecte o se dirija a grupos específicos."),
    ("IND-11", "D2", "INTERNACIONAL", "CI-09", "La universidad publica su código ético o de conducta e identifica al responsable o unidad encargada de integridad y cumplimiento."),
    ("IND-12", "D2", "INTERNACIONAL", "CI-10", "La universidad dispone y publica un canal ético o de denuncias junto con información sobre su procedimiento de utilización, sin exponer datos personales o sensibles."),
    ("IND-13", "D2", "MIXTO", "CI-11", "La universidad publica planes o informes sobre responsabilidad social, sostenibilidad e igualdad que complementen las obligaciones nacionales relacionadas."),
    ("IND-14", "D2", "MIXTO", "CI-12", "La universidad publica cartas o compromisos de servicio y la información disponible sobre su grado de cumplimiento."),
    ("IND-15", "D3", "NACIONAL", "CN-02", "La universidad publica el directorio institucional y el distributivo de personal correspondiente."),
    ("IND-16", "D3", "NACIONAL", "CN-03", "La universidad publica las remuneraciones salariales y demás información remunerativa exigida para su personal."),
    ("IND-17", "D3", "NACIONAL", "CN-04", "La universidad publica la información de funcionarios que se encuentran en licencia o comisión de servicios."),
    ("IND-18", "D3", "NACIONAL", "CN-15", "La universidad publica los contratos colectivos, sus anexos y reformas cuando correspondan."),
    ("IND-19", "D3", "NACIONAL", "CN-23", "La universidad publica la información exigida sobre personal incorporado mediante acciones afirmativas."),
    ("IND-20", "D3", "MIXTO", "CI-13", "La universidad publica información agregada de su plantilla de personal por categorías y género, evitando divulgar datos personales innecesarios."),
    ("IND-21", "D3", "INTERNACIONAL", "CI-15", "La universidad publica las convocatorias y resultados de los procesos públicos de selección de personal que correspondan."),
    ("IND-22", "D3", "INTERNACIONAL", "CI-16", "La universidad publica información sobre el perfil académico o profesional de su profesorado por áreas o unidades académicas."),
    ("IND-23", "D4", "NACIONAL", "CN-05", "La universidad publica los servicios que ofrece, sus formas de acceso y los horarios de atención correspondientes."),
    ("IND-24", "D4", "NACIONAL", "CN-22", "La universidad publica los formularios y formatos necesarios para realizar solicitudes, servicios o trámites institucionales."),
    ("IND-25", "D4", "MIXTO", "CI-17", "La universidad publica su oferta académica vigente organizada por niveles, carreras, programas o titulaciones."),
    ("IND-26", "D4", "INTERNACIONAL", "CI-18", "La universidad publica información cuantificable sobre solicitudes, admisiones, matrículas y plazas ofertadas en su actividad académica."),
    ("IND-27", "D4", "MIXTO", "CI-19", "La universidad publica las becas y ayudas disponibles para estudiantes y la información necesaria para conocer sus condiciones de acceso."),
    ("IND-28", "D4", "MIXTO", "CI-20", "La universidad publica los mecanismos de tutoría, orientación y representación estudiantil disponibles para sus estudiantes."),
    ("IND-29", "D4", "INTERNACIONAL", "CI-21", "La universidad publica los mecanismos institucionales destinados a la atención y defensa de los derechos del alumnado."),
    ("IND-30", "D5", "NACIONAL", "CN-06", "La universidad publica su presupuesto anual con la información de ingresos, gastos, financiamiento, resultados y demás componentes exigidos por la LOTAIP."),
    ("IND-31", "D5", "NACIONAL", "CN-07", "La universidad publica los resultados definitivos de auditorías internas y gubernamentales que correspondan."),
    ("IND-32", "D5", "NACIONAL", "CN-08", "La universidad publica la información de sus procesos de contratación, desde las etapas precontractuales hasta la adjudicación, ejecución o liquidación según corresponda."),
    ("IND-33", "D5", "NACIONAL", "CN-09", "La universidad publica la información sobre contratistas incumplidos y adjudicatarios fallidos que corresponda."),
    ("IND-34", "D5", "NACIONAL", "CN-11", "La universidad publica los contratos de créditos externos e internos y las condiciones de las obligaciones financieras correspondientes."),
    ("IND-35", "D5", "NACIONAL", "CN-13", "La universidad publica la información relacionada con viáticos nacionales e internacionales."),
    ("IND-36", "D5", "NACIONAL", "CN-18", "La universidad publica los convenios nacionales e internacionales suscritos y la información exigida sobre ellos."),
    ("IND-37", "D5", "MIXTO", "CI-23", "La universidad publica información periódica sobre ejecución presupuestaria y modificaciones presupuestarias con un nivel de detalle que permita conocer los cambios realizados durante el período."),
    ("IND-38", "D5", "MIXTO", "CI-24", "La universidad publica sus estados financieros y, cuando exista, una memoria o documento explicativo que facilite su interpretación."),
    ("IND-39", "D5", "MIXTO", "CI-26", "La universidad publica indicadores financieros y patrimoniales que permitan interpretar de forma comparable su situación económica, sin duplicar la información nacional sobre contratos de crédito."),
    ("IND-40", "D5", "INTERNACIONAL", "CI-30", "La universidad publica información sobre su inventario de bienes y patrimonio institucional relevante, diferenciándolo del Registro de Activos de Información."),
    ("IND-41", "D6", "INTERNACIONAL", "CI-31", "La universidad publica resultados de investigación y transferencia, tales como proyectos, publicaciones, tesis, patentes u otros productos científicos institucionales."),
    ("IND-42", "D6", "MIXTO", "CI-32", "La universidad publica indicadores de rendimiento académico, incluyendo información sobre aprobación, duración de los estudios y abandono."),
    ("IND-43", "D6", "INTERNACIONAL", "CI-33", "La universidad publica resultados de mediciones de satisfacción de estudiantes o usuarios respecto de la docencia y los servicios universitarios cuando dichas mediciones se realicen."),
    ("IND-44", "D6", "INTERNACIONAL", "CI-34", "La universidad publica información o resultados sobre inserción laboral y empleabilidad de sus graduados."),
    ("IND-45", "D6", "MIXTO", "CI-35", "La universidad publica información específica sobre recursos captados o destinados a investigación y sobre ayudas propias para actividades científicas."),
    ("IND-46", "D7", "NACIONAL", "CN-14", "La universidad identifica y publica los datos del responsable encargado de atender las solicitudes de acceso a la información pública."),
    ("IND-47", "D7", "NACIONAL", "CN-16", "La universidad publica el índice de información clasificada como reservada conforme a la normativa aplicable."),
    ("IND-48", "D7", "NACIONAL", "CN-17", "La universidad publica la información exigida sobre audiencias y reuniones institucionales."),
    ("IND-49", "D7", "NACIONAL", "CN-24", "La universidad publica otra información relevante para el ejercicio del acceso a la información, la participación ciudadana y el control social."),
    ("IND-50", "D7", "MIXTO", "CI-37", "La universidad publica mecanismos de consulta y participación dirigidos a estudiantes y otros grupos de interés, adicionales a los registros de reuniones exigidos nacionalmente."),
    ("IND-51", "D7", "MIXTO", "CI-38", "La universidad publica canales para propuestas o peticiones, sus instrucciones de uso y la trazabilidad pública que pueda mostrarse sin evaluar la gestión individual de solicitudes."),
    ("IND-52", "D7", "INTERNACIONAL", "CI-39", "La universidad publica la existencia de espacios periódicos de diálogo con sus grupos de interés y mecanismos de seguimiento de los compromisos derivados de estos espacios."),
    ("IND-53", "D7", "MIXTO", "CI-40", "La universidad publica de forma proactiva información sobre el derecho de acceso a la información, sus canales y estadísticas generales disponibles, sin evaluar el trámite individual de solicitudes."),
    ("IND-54", "D8", "NACIONAL", "CN-20", "La universidad publica y mantiene disponible su Registro de Activos de Información."),
    ("IND-55", "D8", "MIXTO", "CI-42", "El portal institucional utilizado para la transparencia cumple un conjunto consolidado de criterios de accesibilidad WCAG 2.2 de niveles A y AA pertinentes para el acceso a la información."),
    ("IND-56", "D8", "MIXTO", "CI-43", "La universidad conserva y facilita el acceso al histórico de la información de transparencia cuando resulte aplicable, complementando las exigencias nacionales de actualización y completitud."),
    ("IND-57", "D8", "MIXTO", "CI-45", "Los conjuntos de datos publicados por la universidad utilizan identificadores consistentes y condiciones que favorecen su interoperabilidad, complementando los requisitos nacionales de metadatos y estandarización."),
    ("IND-58", "D8", "MIXTO", "CI-46", "La universidad dispone de un catálogo o espacio organizado para sus datos abiertos e identifica conjuntos de alto valor pertinentes para el ámbito universitario."),
]


FAMILIES = {
    "CI-01": ("Misión, visión e información histórica institucional", ["Dyntra", "Fundación Haz"]),
    "CI-03": ("Perfil, funciones y contacto de autoridades", ["Dyntra", "Fundación Haz"]),
    "CI-04": ("Órganos colegiados", ["Dyntra", "Fundación Haz"]),
    "CI-05": ("Repositorio de acuerdos y resoluciones", ["Dyntra", "Fundación Haz"]),
    "CI-06": ("Entidades dependientes o participadas", ["Dyntra", "Fundación Haz"]),
    "CI-09": ("Código ético e integridad institucional", ["Dyntra", "Fundación Haz"]),
    "CI-10": ("Canal ético o de denuncias", ["Fundación Haz"]),
    "CI-11": ("Responsabilidad social, sostenibilidad e igualdad", ["Dyntra", "Fundación Haz"]),
    "CI-12": ("Compromisos de servicio y cumplimiento", ["Dyntra"]),
    "CI-13": ("Plantilla de personal por categorías y género", ["Dyntra", "Fundación Haz"]),
    "CI-15": ("Selección pública de personal", ["Dyntra"]),
    "CI-16": ("Perfil académico del profesorado", ["Dyntra", "Fundación Haz"]),
    "CI-17": ("Oferta académica", ["Dyntra"]),
    "CI-18": ("Admisiones, matrículas y plazas", ["Dyntra", "Fundación Haz"]),
    "CI-19": ("Becas y ayudas", ["Dyntra", "Fundación Haz"]),
    "CI-20": ("Tutoría, orientación y representación estudiantil", ["Dyntra", "Fundación Haz"]),
    "CI-21": ("Defensa de derechos del alumnado", ["Dyntra"]),
    "CI-23": ("Ejecución y modificaciones presupuestarias", ["Dyntra"]),
    "CI-24": ("Estados financieros y memoria explicativa", ["Dyntra", "Fundación Haz"]),
    "CI-26": ("Indicadores financieros y patrimoniales", ["Dyntra"]),
    "CI-30": ("Inventario y patrimonio institucional", ["Dyntra"]),
    "CI-31": ("Resultados de investigación y transferencia", ["Dyntra", "Fundación Haz"]),
    "CI-32": ("Rendimiento académico", ["Dyntra", "Fundación Haz"]),
    "CI-33": ("Satisfacción de estudiantes y usuarios", ["Dyntra", "Fundación Haz"]),
    "CI-34": ("Empleabilidad de graduados", ["Dyntra", "Fundación Haz"]),
    "CI-35": ("Financiación y ayudas para investigación", ["Dyntra"]),
    "CI-37": ("Consulta y participación", ["Dyntra", "OGP"]),
    "CI-38": ("Canales para propuestas y peticiones", ["Dyntra", "OGP"]),
    "CI-39": ("Diálogo y seguimiento participativo", ["OGP"]),
    "CI-40": ("Información proactiva sobre acceso a la información", ["Dyntra", "OGP"]),
    "CI-42": ("Accesibilidad web WCAG 2.2 A y AA", ["WCAG 2.2"]),
    "CI-43": ("Histórico de información de transparencia", ["Open Data Charter", "Fundación Haz"]),
    "CI-45": ("Interoperabilidad e identificadores consistentes", ["Open Data Charter", "OURdata"]),
    "CI-46": ("Catálogo de datos abiertos y conjuntos de alto valor", ["Dyntra", "Open Data Charter", "OURdata"]),
}


# Términos observables utilizados para ampliar las consultas sin depender de
# una única redacción metodológica. Se mantienen acotados al dominio oficial.
SEARCH_SYNONYMS = {
    "CI-01": ["identidad institucional", "reseña histórica", "misión y visión"],
    "CI-03": ["autoridades", "hoja de vida", "contacto institucional"],
    "CI-04": ["consejo politécnico", "órganos colegiados", "actas y resoluciones"],
    "CI-05": ["resoluciones", "acuerdos institucionales", "repositorio normativo"],
    "CI-06": ["fundaciones", "empresas públicas", "entidades vinculadas"],
    "CI-09": ["código de ética", "integridad", "comité de ética"],
    "CI-10": ["canal de denuncias", "denuncias éticas", "procedimiento de denuncia"],
    "CI-11": ["sostenibilidad", "responsabilidad social", "igualdad"],
    "CI-12": ["carta de servicios", "compromisos de calidad", "cumplimiento de servicios"],
    "CI-13": ["personal por género", "estadísticas de personal", "distributivo por categoría"],
    "CI-15": ["concursos de méritos", "selección de personal", "convocatorias y resultados"],
    "CI-16": ["perfil docente", "formación del profesorado", "planta académica"],
    "CI-17": ["oferta académica", "carreras", "programas académicos"],
    "CI-18": ["admisiones", "matrículas", "cupos ofertados"],
    "CI-19": ["becas estudiantiles", "ayudas económicas", "apoyo estudiantil"],
    "CI-20": ["tutorías", "orientación estudiantil", "representación estudiantil"],
    "CI-21": ["defensoría estudiantil", "derechos estudiantiles", "bienestar estudiantil"],
    "CI-23": ["ejecución presupuestaria", "reformas presupuestarias", "presupuesto ejecutado"],
    "CI-24": ["estados financieros", "balance general", "memoria financiera"],
    "CI-26": ["indicadores financieros", "patrimonio", "situación financiera"],
    "CI-30": ["inventario de bienes", "patrimonio institucional", "activos institucionales"],
    "CI-31": ["proyectos de investigación", "publicaciones y tesis", "transferencia tecnológica"],
    "CI-32": ["rendimiento académico", "tasa de aprobación", "deserción estudiantil"],
    "CI-33": ["satisfacción estudiantil", "encuestas de satisfacción", "calidad de servicios"],
    "CI-34": ["empleabilidad", "inserción laboral", "seguimiento a graduados"],
    "CI-35": ["financiación de investigación", "fondos de investigación", "ayudas científicas"],
    "CI-37": ["participación universitaria", "consulta pública", "grupos de interés"],
    "CI-38": ["peticiones", "propuestas ciudadanas", "buzón de sugerencias"],
    "CI-39": ["mesas de diálogo", "compromisos participativos", "seguimiento ciudadano"],
    "CI-40": ["acceso a la información", "solicitudes de información", "estadísticas de acceso"],
    "CI-42": ["accesibilidad web", "WCAG", "declaración de accesibilidad"],
    "CI-43": ["histórico de transparencia", "archivo de información", "años anteriores"],
    "CI-45": ["interoperabilidad", "identificadores", "formatos abiertos"],
    "CI-46": ["datos abiertos", "catálogo de datos", "conjuntos de alto valor"],
}


# Componentes verificables de cada criterio. La evaluación debe distinguir entre
# cobertura completa, cobertura parcial y ausencia real de evidencia.
EVALUATION_ELEMENTS = {
    "CI-01": ["misión", "visión", "historia institucional"],
    "CI-03": ["perfil académico o profesional de las autoridades", "contacto institucional de las autoridades"],
    "CI-04": ["composición de órganos colegiados", "competencias", "reglamentos", "actas o acuerdos"],
    "CI-05": ["repositorio público", "acuerdos o resoluciones institucionales"],
    "CI-06": ["identificación de entidades vinculadas", "relación institucional de cada entidad"],
    "CI-09": ["código ético o de conducta", "responsable, comité o unidad de integridad"],
    "CI-10": ["canal de denuncias", "procedimiento de utilización", "protección de datos sensibles"],
    "CI-11": ["responsabilidad social", "sostenibilidad", "igualdad"],
    "CI-12": ["compromisos o cartas de servicio", "grado de cumplimiento"],
    "CI-13": ["personal por categorías", "distribución por género", "datos agregados"],
    "CI-15": ["convocatorias públicas", "resultados de selección"],
    "CI-16": ["perfil académico o profesional docente", "organización por áreas o unidades"],
    "CI-17": ["oferta académica vigente", "organización por niveles o titulaciones"],
    "CI-18": ["solicitudes o aspirantes", "admisiones", "matrículas", "plazas o cupos ofertados"],
    "CI-19": ["becas o ayudas disponibles", "condiciones de acceso"],
    "CI-20": ["tutoría", "orientación estudiantil", "representación estudiantil"],
    "CI-21": ["mecanismos de atención", "defensa de derechos del alumnado"],
    "CI-23": ["ejecución presupuestaria", "modificaciones o reformas presupuestarias", "detalle del período"],
    "CI-24": ["estados financieros", "memoria o explicación financiera"],
    "CI-26": ["indicadores financieros", "indicadores patrimoniales", "comparabilidad"],
    "CI-30": ["inventario de bienes", "patrimonio institucional", "diferenciación del registro de activos de información"],
    "CI-31": ["resultados de investigación", "proyectos, publicaciones, tesis, patentes o transferencia"],
    "CI-32": ["aprobación o rendimiento", "duración de estudios", "abandono o deserción"],
    "CI-33": ["medición de satisfacción", "resultados publicados"],
    "CI-34": ["inserción laboral o empleabilidad", "resultados sobre graduados"],
    "CI-35": ["recursos para investigación", "ayudas o convocatorias científicas"],
    "CI-37": ["mecanismos de consulta", "participación de estudiantes o grupos de interés"],
    "CI-38": ["canal de propuestas o peticiones", "instrucciones de uso", "trazabilidad pública agregada"],
    "CI-39": ["espacios periódicos de diálogo", "compromisos derivados", "seguimiento de compromisos"],
    "CI-40": ["derecho de acceso a la información", "canales de solicitud", "estadísticas generales"],
    "CI-42": ["accesibilidad del portal", "criterios WCAG 2.2 nivel A", "criterios WCAG 2.2 nivel AA"],
    "CI-43": ["archivo histórico", "acceso a años o períodos anteriores"],
    "CI-45": ["identificadores consistentes", "metadatos o diccionarios", "condiciones de interoperabilidad"],
    "CI-46": ["catálogo o espacio de datos abiertos", "organización de conjuntos", "conjuntos de alto valor"],
}


# Dos consultas complementarias, siempre en el mismo motor configurado. La
# primera descubre evidencia en toda la web y la segunda prioriza documentos
# institucionales del tipo que normalmente acredita cada requisito.
SEARCH_DOCUMENT_HINTS = {
    "CI-01": ['"misión y visión" "reseña histórica"', '"síntesis histórica" identidad institucional'],
    "CI-03": ['autoridades "hoja de vida" contacto', 'rector vicerrector perfil correo'],
    "CI-04": ['"resoluciones y actas" "consejo"', '"índice de resoluciones y actas" órganos colegiados reglamento'],
    "CI-05": ['repositorio resoluciones acuerdos', '"resoluciones" "actas" repositorio documental'],
    "CI-06": ['"empresa pública" fundación entidades vinculadas', 'entidades dependientes participadas organizaciones vinculadas'],
    "CI-09": ['"código de ética" "comité de ética"', '"código de conducta" integridad responsable'],
    "CI-10": ['"formulario de denuncia" procedimiento', '"recepción de denuncias" protocolo canal correo'],
    "CI-11": ['"plan de igualdad" sostenibilidad responsabilidad social', '"rendición de cuentas" igualdad sostenibilidad'],
    "CI-12": ['"carta de servicios" cumplimiento', 'compromisos de servicio indicadores cumplimiento'],
    "CI-13": ['"personal" categorías género estadísticas', '"distributivo" género personal agregado'],
    "CI-15": ['"concurso de méritos y oposición" resultados', '"resultados finales" concurso personal convocatoria'],
    "CI-16": ['"perfil docentes" departamentos formación', 'profesores por unidad académica hoja de vida'],
    "CI-17": ['"oferta académica" carreras programas', 'grado posgrado doctorado titulaciones'],
    "CI-18": ['"rendición de cuentas" cupos matriculados admisión', 'aspirantes admitidos matrículas "cupos ofertados"'],
    "CI-19": ['becas ayudas "condiciones de acceso"', 'reglamento becas apoyo económico requisitos'],
    "CI-20": ['tutorías orientación "representación estudiantil"', 'reglamento tutorías bienestar representantes estudiantiles'],
    "CI-21": ['derechos estudiantes bienestar defensa atención', 'asesoría legal estudiantes protocolo derechos'],
    "CI-23": ['"ejecución presupuestaria" codificado modificado devengado', '"rendición de cuentas" "reformas presupuestarias" presupuesto'],
    "CI-24": ['"estados financieros" memoria', 'balance general notas estados financieros'],
    "CI-26": ['"indicadores financieros" patrimonio', 'situación financiera indicadores comparativos'],
    "CI-30": ['"inventario de bienes" patrimonio', 'bienes institucionales activos inventario'],
    "CI-31": ['"producción científica" "proyectos de investigación"', 'investigación en cifras publicaciones tesis transferencia'],
    "CI-32": ['"rendimiento académico" aprobación deserción', 'indicadores académicos abandono duración estudios'],
    "CI-33": ['"resultados encuesta de satisfacción"', 'informe satisfacción estudiantes usuarios servicios'],
    "CI-34": ['"encuesta graduados" empleabilidad resultados', '"inserción laboral" "seguimiento a graduados" informe'],
    "CI-35": ['presupuesto investigación fondos ayudas', 'convocatorias investigación financiamiento proyectos'],
    "CI-37": ['participación estudiantes consulta "grupos de interés"', 'elecciones representantes deliberación consulta pública'],
    "CI-38": ['"buzón de sugerencias" peticiones', 'canal propuestas instrucciones seguimiento solicitudes'],
    "CI-39": ['"acta compromiso" "aportes ciudadanos"', '"rendición de cuentas" deliberación compromisos seguimiento'],
    "CI-40": ['"solicitudes de acceso a la información pública" estadísticas', 'formulario responsable canal acceso información'],
    "CI-42": ['"declaración de accesibilidad" "WCAG 2.2"', 'auditoría accesibilidad nivel A AA'],
    "CI-43": ['"histórico de transparencia" años anteriores', 'archivo transparencia períodos anteriores'],
    "CI-45": ['"conjunto de datos" metadatos diccionario interoperabilidad', 'identificadores formatos abiertos datos reutilizables'],
    "CI-46": ['"catálogo de datos abiertos" "alto valor"', 'conjuntos de datos metadatos diccionario catálogo'],
}


# Fragmentos de ruta con los que los portales universitarios suelen publicar
# cada criterio. Una coincidencia en la URL del mapa del sitio vale más que las
# palabras sueltas: /nosotros u /oferta-de-grado no repiten el texto del indicador.
SITE_PATH_HINTS = {
    "CI-01": ["nosotros", "quienes somos", "mision", "vision", "historia", "identidad institucional"],
    "CI-03": ["autoridades", "rectorado", "vicerrectorado"],
    "CI-04": ["consejo politecnico", "consejo universitario", "organos colegiados", "resoluciones"],
    "CI-05": ["resoluciones", "repositorio documental", "secretaria general"],
    "CI-06": ["empresa publica", "fundacion", "entidades vinculadas"],
    "CI-09": ["codigo de etica", "comite de etica", "integridad"],
    "CI-10": ["denuncias", "canal etico", "poli sin violencia"],
    "CI-11": ["igualdad", "sostenibilidad", "responsabilidad social", "inclusion"],
    "CI-12": ["carta de servicios", "compromisos de servicio"],
    "CI-13": ["talento humano", "distributivo", "personal"],
    "CI-15": ["concursos", "ofertas laborales", "convocatorias"],
    "CI-16": ["docentes", "profesores", "planta docente", "departamento"],
    "CI-17": ["oferta de grado", "oferta de posgrado", "oferta academica", "carreras", "admision"],
    "CI-18": ["admision", "cupos", "estadisticas", "en cifras"],
    "CI-19": ["becas", "ayudas economicas", "apoyo economico"],
    "CI-20": ["tutorias", "bienestar", "consejo estudiantil", "representacion estudiantil"],
    "CI-21": ["bienestar", "defensoria", "derechos estudiantiles"],
    "CI-23": ["presupuesto", "ejecucion presupuestaria"],
    "CI-24": ["estados financieros", "informacion financiera"],
    "CI-26": ["indicadores financieros", "informacion financiera"],
    "CI-30": ["inventario", "bienes", "patrimonio"],
    "CI-31": ["investigacion", "investiga", "produccion cientifica", "en cifras"],
    "CI-32": ["rendimiento academico", "estadisticas", "en cifras"],
    "CI-33": ["satisfaccion", "encuesta"],
    "CI-34": ["graduados", "egresados", "empleabilidad", "bolsa de trabajo"],
    "CI-35": ["investigacion", "convocatorias", "proyectos"],
    "CI-37": ["participacion", "consulta publica", "consulta ciudadana"],
    "CI-38": ["buzon", "sugerencias", "peticiones"],
    "CI-39": ["rendicion de cuentas", "dialogo"],
    "CI-40": ["acceso a la informacion", "transparencia pasiva", "lotaip"],
    "CI-42": ["accesibilidad"],
    "CI-43": ["lotaip", "transparencia", "historico", "rendicion de cuentas"],
    "CI-45": ["datos abiertos", "interoperabilidad"],
    "CI-46": ["datos abiertos", "catalogo de datos", "en cifras"],
}


# Precisiones para el modelo en criterios que se prestan a confusión. Solo
# explicitan lo que ya dice el enunciado o sus elementos; no anticipan resultados.
EVALUATION_NOTES = {
    "CI-09": "Un comité de ética o de integridad creado por el propio código cuenta como unidad responsable.",
    "CI-11": (
        "Cada elemento (responsabilidad social, sostenibilidad, igualdad) requiere un plan, informe o sección "
        "que trate ese tema; el nombre de una unidad o el encabezado de un formulario no lo acredita."
    ),
    "CI-33": (
        "La medición debe referirse a la docencia o a los servicios universitarios; una encuesta sobre un "
        "proyecto puntual acredita el criterio solo de forma parcial."
    ),
    "CI-45": (
        "Un trabajo académico que describe interoperabilidad no acredita que los datos publicados por la "
        "universidad la tengan: la evidencia deben ser sus propios conjuntos de datos."
    ),
    "CI-46": (
        "Un repositorio documental, una biblioteca digital o un catálogo de compras públicas no es un catálogo "
        "de datos abiertos: se requieren conjuntos de datos descargables en formatos reutilizables "
        "(CSV, JSON, XLSX o API) organizados en un espacio propio."
    ),
}


# Criterios de datos institucionales que el informe de rendición de cuentas ante el
# CPCCS suele concentrar (personal, admisión, rendimiento, graduados, investigación,
# presupuesto, igualdad, diálogo). Toda institución pública ecuatoriana debe
# publicarlo, así que se ofrece siempre como evidencia candidata en lugar de
# depender de que la búsqueda lo encuentre.
ANCHOR_DOCUMENT_FAMILIES = {
    "CI-11", "CI-13", "CI-18", "CI-23", "CI-31", "CI-32", "CI-33", "CI-34", "CI-35", "CI-39",
}


# Familias en las que una norma o un trabajo académico es, en sí mismo, la
# evidencia esperada. En las demás, leyes, reglamentos y tesis solo mencionan
# el tema y no acreditan que la universidad publique la información.
NORMATIVE_EVIDENCE_FAMILIES = {"CI-04", "CI-05", "CI-06", "CI-09", "CI-10", "CI-19", "CI-20", "CI-21"}
THESIS_EVIDENCE_FAMILIES = {"CI-31"}


def lotaip_numerals_for(family_code):
    if not family_code.startswith("CN-"):
        return []
    value = int(family_code.split("-")[1])
    if value == 1:
        return [1]
    if value == 22:
        return [5]
    return [value]

