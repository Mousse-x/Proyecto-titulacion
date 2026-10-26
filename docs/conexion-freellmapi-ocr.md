# Evaluación LOTAIP con OCR y FreeLLMAPI

La aplicación React llama a Django. Django descarga los verificables públicos, extrae el texto con PyMuPDF o Tesseract y envía ese texto junto con el numeral, campo y registro a FreeLLMAPI. La clave del proveedor nunca se envía al navegador.

## Configuración necesaria

Este proyecto usa https://github.com/tashfeenahmed/freellmapi. La instancia indicada por el usuario está en `http://127.0.0.1:31415/v1`, dirección predeterminada del backend. Se utiliza `/chat/completions`, la clave unificada de la pantalla Keys y el modelo `auto`. La instancia necesita al menos un proveedor habilitado y configurado.

Se requieren:

1. URL real de la instancia, terminada en `/v1`.
2. Clave unificada del panel Keys de esa instancia.
3. Modelo disponible o `auto`.
4. Tesseract instalado en la computadora que ejecuta Django, con el idioma español `spa`.

Referencia: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/api/01-rest-api.md

La instalación local puede guardar la clave en `backend/.freellmapi-key`, archivo excluido de Git. Django lo lee automáticamente al iniciar. La variable `FREELLMAPI_API_KEY`, si se establece, tiene prioridad. No se debe copiar este archivo al frontend ni publicarlo. Con ese archivo configurado, no es necesario volver a ingresar la clave en cada terminal.

Desde PowerShell, en la carpeta `backend`, establecer las variables **en la misma terminal que inicia Django**:

```powershell
$env:FREELLMAPI_BASE_URL = 'http://127.0.0.1:31415/v1'
$env:FREELLMAPI_MODEL = 'auto:reliable'
$env:TESSERACT_CMD = 'C:\Program Files\Tesseract-OCR\tesseract.exe'
$env:LOTAIP_OCR_LANGUAGE = 'spa'
$apiSecret = Read-Host 'Clave unificada de FreeLLMAPI' -AsSecureString
$env:FREELLMAPI_API_KEY = [System.Net.NetworkCredential]::new('', $apiSecret).Password
& .\.venv\Scripts\python.exe manage.py check_lotaip_services --probe
& .\.venv\Scripts\python.exe manage.py runserver
```

Cambiar la URL y ruta de Tesseract por las reales. `TESSERACT_CMD` es opcional si el ejecutable está en PATH o en la carpeta habitual de Tesseract-OCR dentro de Program Files: Django lo detecta automáticamente. Se admiten HTTPS remoto y HTTP en localhost. No usar variables `VITE_` para la clave. La configuración lee variables de entorno; no carga archivos `.env` automáticamente. Si se reinicia la terminal, volver a establecer las variables. Si Django corre en otro equipo o contenedor, localhost se refiere a ese equipo o contenedor.

La comprobación `--probe` envía un acta ficticia, nunca documentos de la base de datos. Sin `--probe`, sólo comprueba la configuración local y Tesseract.

Bibliotecas instaladas dentro del proyecto y fijadas en `backend/requirements-lotaip.txt`: pytesseract, Pillow y PyMuPDF. Para reinstalarlas:

```powershell
& .\.venv\Scripts\python.exe -m pip install -r requirements-lotaip.txt
```

## Reglas de la versión LOTAIP-v3-OCR-IA

- CTA: publicación comprobada en el PNT, paquete completo y fecha de metadatos del mes de datos seleccionado. El monitoreo corresponde al mes siguiente. Una falta de acceso técnico al PNT queda pendiente; una ausencia de publicación comprobada obtiene cero.
- ETA: los tres CSV deben estar estructurados y delimitados por comas. Se pueden leer otros delimitadores para evaluar su contenido, pero no reciben el punto de ETA.
- RP: `published_at` del PNT, convertido a la fecha de Ecuador, comparado con el día 15 del mes siguiente o siguiente laborable. Se conservan las reglas de calendario existentes y el ajuste mediante `LOTAIP_NON_WORKING_DAYS`.
- Verificables: se buscan campos explícitos de la matriz, tanto en conjunto de datos como en metadatos. Se incluyen 9 y 14; el 23 no tiene verificación de enlaces.
- URL o NO APLICA: en un campo de enlace se acepta una URL HTTP(S) o NO APLICA. NO APLICA obtiene siempre SI, aunque no tenga justificación en el diccionario, y no ejecuta descarga, OCR o IA. Un nombre de archivo, correo, ND, INFORMACIÓN NO DISPONIBLE sin justificación o un campo vacío obtiene NO.
- Esta regla de NO APLICA como cumplimiento es una adaptación solicitada para la metodología del proyecto, no una afirmación de equivalencia literal con el instructivo oficial.
- Los campos mixtos configurados de los formatos 5-22 y 14 admiten una URL o un correo electrónico válido. Los demás campos de enlace conservan la exigencia de URL.
- Se verifica cada fila y campo requerido. Una URL compartida se descarga una vez por paquete y las filas que apuntan al mismo contenido se envían a la IA en lotes de hasta 12 registros. La respuesta conserva una decisión independiente por fila, pero evita repetir el documento y las instrucciones en una petición por cada registro. De cada fila se envían como máximo seis campos temáticos relevantes y 900 caracteres en total; se priorizan códigos, objetivos, indicadores, metas, objetos, descripciones, nombres, tipos, procesos, unidades y fechas, y se excluyen enlaces y texto accesorio.
- PDF con texto: PyMuPDF. Páginas sin texto suficiente e imágenes: Tesseract. HTML: extracción de texto visible. Un límite de páginas, contenido no soportado o fallo de extracción queda pendiente; no se aprueba una lectura parcial.
- La IA recibe la fila completa —sin repetir el campo URL—, numeral, requisito, documento y campo. Cada fila se compara por separado aunque varias compartan el mismo archivo. Debe responder JSON con decisión y citas literales comprobables para aprobar. Si hubo acceso y texto pero no existe evidencia suficiente, obtiene NO; PENDIENTE se reserva para respuestas inválidas, cuotas, errores de conexión, falta de acceso o fallos de extracción.
- Vigencia: numerales 16 y 18. Validez: numerales 3 y 6. Se conserva el muestreo reproducible de vigencia y los cálculos decimales de importes.
- CI: promedio de las comprobaciones cualitativas aplicables resueltas (cada criterio por formato es una comprobación). Dentro de verificables, todas las filas/campos deben cumplir. Criterios no correspondientes se excluyen. Pendientes no obtienen cero ni uno y vuelven provisional el SITA.
- SITA: `(CTA + ETA + RP + CI) / 4`. Si falta por completo algún componente no se presenta un SITA definitivo. Los límites mínimo/máximo representan las comprobaciones pendientes como cero/uno, sin asignar esas notas.
- Las evaluaciones terminadas se conservan. El botón Reintentar evaluación pendiente completa un paquete pendiente y reutiliza los resultados de enlaces ya terminados cuando el registro y su justificación no cambiaron. No se migran ni recalifican automáticamente evaluaciones históricas.

## Límites configurables

`FREELLMAPI_TIMEOUT` (60 segundos por petición), `FREELLMAPI_MAX_INPUT_CHARS` (1500 caracteres seleccionados por pertinencia), `FREELLMAPI_MAX_OUTPUT_TOKENS` (400), `FREELLMAPI_BATCH_SIZE` (12 filas por lote), `FREELLMAPI_BATCH_MAX_OUTPUT_TOKENS` (tope de 2400; la reserva real se calcula proporcionalmente a 140 tokens por fila, con mínimo de 400), `FREELLMAPI_MAX_TOKENS_PER_RUN` (200000 tokens estimados o reportados por evaluación masiva), `FREELLMAPI_CONCURRENCY` (1 análisis simultáneo), `FREELLMAPI_MAX_ATTEMPTS` (3 intentos), `FREELLMAPI_RETRY_BASE_SECONDS` (5 segundos), `FREELLMAPI_MAX_RETRY_SECONDS` (30 segundos), `FREELLMAPI_MIN_INTERVAL_SECONDS` (1 segundo entre solicitudes), `FREELLMAPI_ANALYSIS_CACHE_SIZE` (4096 decisiones reutilizables durante la ejecución), `LOTAIP_OCR_TIMEOUT` (45 segundos por imagen/página), `LOTAIP_SEMANTIC_SAMPLE_PAGES` (10 páginas distribuidas entre inicio, cuerpo y final), `LOTAIP_MAX_DOCUMENT_PAGES` (100), `LOTAIP_MAX_DOCUMENT_CHARS` (100000) y `LOTAIP_PACKAGE_TIMEOUT` (1800 segundos por paquete, como techo para matrices extensas). Se usa `auto:reliable` para priorizar rutas con éxito reciente. El cliente respeta `Retry-After` en respuestas HTTP 429 hasta el máximo configurado, comunica la espera, libera la reserva local de solicitudes rechazadas o sin respuesta y detiene nuevas consultas antes de superar el presupuesto configurado. El contexto común del literal se envía una sola vez por lote. El documento se extrae con una muestra distribuida de hasta diez páginas; a FreeLLMAPI se envía una identificación breve y hasta tres fragmentos por párrafos u oraciones, ponderados por los términos de la fila y filtrados para evitar repeticiones. Los formatos que requieren navegación interactiva o sistemas protegidos pueden necesitar revisión cuando el contenido recuperado no aporta evidencia suficiente.

La validación masiva se ejecuta en segundo plano. El POST inicial devuelve un identificador de ejecución y el frontend consulta periódicamente `/api/lotaip/ejecuciones/<id>/`; perder la conexión HTTP inicial o recargar la página no cancela el trabajo. Al volver a iniciar la misma evaluación, el cliente se conecta a la ejecución activa. El botón de cancelación cambia su estado y el trabajador se detiene de forma cooperativa.
