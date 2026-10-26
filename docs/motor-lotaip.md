# Motor LOTAIP

El motor nacional se encuentra en `backend/core/lotaip_engine/`. Su versión actual es
`DPE-053-2024-v2` y su fuente normativa es la Resolución 053-DPE-CGAJ-2024. No comparte
reglas ni ponderaciones con el evaluador internacional.

## Estructura

- `rules.py`: matriz central de aplicabilidad de los 24 numerales y versión normativa.
- `schemas_2024.json` y `schemas.py`: los 25 formatos oficiales, incluidos los tres
  formatos del numeral 1 y la plantilla compartida por los numerales 5 y 22.
- `evaluator.py`: frontera pública y adaptador compatible con resultados históricos.
- `parsers.py`: lectura normalizada de CSV y separación entre URL original y copia local.
- `link_validator.py`: contrato del verificador de enlaces. La descarga segura y las
  defensas SSRF se implementan en `services/lotaip_automatic.py`.
- `scoring.py`: CTA, ETA, RP, CI y `SITA = (CTA + ETA + RP + CI) / 4`.
- `evidence.py` y `exceptions.py`: evidencia, advertencias y errores técnicos.

Los campos oficiales se extrajeron de las plantillas XLSX conservadas en
`backend/media/templates`. `IndicatorTemplate` puede seleccionar una plantilla, pero no
redefine la norma. Una regla normativa nueva se agrega como una versión nueva; nunca se
modifica silenciosamente una evaluación histórica.

La validación normaliza mayúsculas, tildes, espacios, guiones y puntuación. No compara por
posición. Una columna requerida ausente produce `MISSING_REQUIRED_FIELD`, con el numeral,
el nombre esperado y los encabezados encontrados. Las columnas adicionales generan una
advertencia y no reducen por sí solas la calificación.

## Ejecución y API

La ruta existente `POST /api/evaluacion/universidades/{id}/validar-todo/` crea ahora un
`LotaipEvaluationRun`, devuelve su id en el flujo NDJSON y en `X-LOTAIP-Run-Id`. El estado
persistido se consulta en `GET /api/lotaip/ejecuciones/{id}/`.

Otros endpoints:

- `GET /api/lotaip/config/numerales/`: matriz vigente de los 24 numerales.
- `POST /api/evaluacion/documentos/{id}/validar/`: evaluación de un formato.
- `GET /api/evaluacion/documentos/{id}/resultado/`: resultado, evidencia y versión.
- `GET /api/evaluacion/universidades/{id}/resumen/`: CTA, ETA, RP, CI, SITA y cobertura.
- `POST /api/evaluacion/documentos/{id}/revision-manual/`: decisión auditada sobre un
  criterio ambiguo; conserva el resultado automático original.

La revisión manual recibe `criterion`, `decision` (`ACEPTAR` o `RECHAZAR`) y
`observation`. Se almacena usuario, fecha, decisión, observación y resultado automático.

## Estados

`NOT_APPLICABLE` y `SIN EVALUACIÓN` se excluyen del denominador. Un timeout, error de
parser o fuente externa no disponible se registra como `TECHNICAL_ERROR`; no se convierte
en cero. Cuando acceso y legibilidad son comprobables pero la correspondencia no puede
decidirse de forma determinista, el caso requiere revisión.

Cada evaluación conserva además el SHA-256 de `schemas_2024.json`. Así, la versión
`DPE-053-2024-v2` queda vinculada de forma reproducible con el esquema exacto usado,
sin modificar evaluaciones históricas.

## Pruebas

Desde `backend/`:

```powershell
.\.venv\Scripts\python.exe manage.py test core.test_lotaip_rubric core.test_lotaip_engine
.\.venv\Scripts\python.exe manage.py check
```

Desde `frontend/`:

```powershell
npm run build
```

Las pruebas cubren la matriz completa de 24 numerales, cálculo SITA, CSV, errores técnicos,
SSRF, enlaces, fechas, muestreo reproducible y las reglas de validez de los numerales 3 y 6.
