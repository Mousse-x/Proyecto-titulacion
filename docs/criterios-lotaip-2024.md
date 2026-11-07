# Evaluación de transparencia activa

Fuente: instructivo versión 1.0, julio de 2024, aprobado por Resolución
053-DPE-CGAJ-2024, Registro Oficial 633 del 30 de agosto de 2024.
[Publicación oficial](https://www.registroficial.gob.ec/registro-oficial-no-633/).
Se implementa la versión aportada por el usuario; no se afirma que sea la última reforma normativa.

| Criterio | Calificación | Fundamento de la nota |
| --- | --- | --- |
| Información completa y actualizada (CTA) | 1 / 0,5 / 0 | 1 si está publicada, accesible, completa y actualizada; 0,5 si es accesible pero incompleta o desactualizada; 0 si no está publicada o es inaccesible. Fecha en metadatos: mes anterior al monitoreo. Verificar los campos de los tres archivos y notas aclaratorias. Tabla 1, p. 59. |
| Estructura de datos abiertos (ETA) | 1 / 0 | CSV estructurado delimitado por comas publicado y accesible. PDF y XLSX no obtienen el punto reservado al CSV. Tabla 2, p. 60. |
| Registro dentro del plazo (RP) | 1 / 0 | Registro en el PNT hasta el 15 del mes siguiente o siguiente día laborable; cero si es posterior. Comprobar feriados y fecha real de registro. La carga local no es esa fecha. Tabla 3, p. 60. |
| Estado de verificables | Sí / No / Sin evaluación | Libre acceso, correspondencia y legibilidad de los documentos o sistemas enlazados. Sin evaluación: enlace con NO APLICA (sin exigir nota), o INFORMACIÓN NO DISPONIBLE con nota en el diccionario. Tabla 6, p. 63. Con más de 3 filas se revisa una muestra reproducible de 3 (nota 3, aplicada por analogía) y todos sus enlaces deben cumplir. |
| Vigencia de la información | Sí / No | Comprobar inicio y plazo de vigencia. Art. 19.16 y 19.18; art. 21 formatos 1, 2, 4 y 5. Más de tres filas: muestra aleatoria de tres y documentar su selección. Tabla 4 y nota 3, pp. 61–62. |
| Validez de la información | Sí / No | Art. 19.3: suma de décimos, horas y encargos/subrogaciones igual al total adicional. Art. 19.6: devengado + saldo por devengar = codificado. Tabla 5, p. 62. |

## Cálculo y alcance

SITA = (CTA + ETA + RP + CI) / 4, con componentes en porcentaje (sección 9, p. 64).
La implementación obtiene el promedio de cada columna; para CI promedia las columnas
cualitativas aplicables con Sí=1 y No=0. Es una decisión operativa documentada para
implementar la fórmula general del instructivo, que no desarrolla esa conversión en detalle.
No aplica y Sin evaluación se excluyen. Si una consulta externa falla de forma transitoria,
el criterio queda como No verificable automáticamente y no se inventa una calificación.
La nota individual de un formato promedia únicamente sus componentes aplicables. El SITA
institucional conserva los cuatro componentes CTA, ETA, RP y CI.

La unidad es universidad, período, mes y formato/indicador: los tres CSV del paquete
no se cuentan tres veces. El resultado cubre los formatos evaluados, no acredita por sí
solo que se hayan presentado todas las obligaciones institucionales.
El catálogo actual LOTAIP-1 ... LOTAIP-24 corresponde al artículo 19; la tabla 7 excluye
verificables para los numerales 2, 3, 4 y 6, y restringe vigencia/validez a los numerales
indicados arriba. Otros códigos requieren comprobación de aplicabilidad; no se deben
interpretar automáticamente como obligaciones específicas de los artículos 20–30.

## Uso

La evaluación es automática. Consulta la API pública del PNT, acredita la publicación y su
fecha, compara el inventario oficial con las URLs guardadas, analiza íntegramente los tres CSV,
comprueba el delimitador, campos vacíos, período de metadatos, excepciones y notas aclaratorias,
vigencia, sumas y enlaces verificables. Una nota automática incluye el hallazgo que la sustenta.

1. En Evaluación LOTAIP, seleccionar universidad, período y mes y ejecutar la validación.
2. Expandir un documento para ver la tabla de criterios, calificación y observación.
3. Si un criterio dice No verificable automáticamente, la observación identifica la fuente
   ausente, el error de red o la estructura ambigua. Reintentar la evaluación vuelve a consultar
   el PNT; esta condición no se presenta como pendiente de revisión humana.
4. Revalidar reemplaza las calificaciones del paquete con una nueva comprobación automática.
5. Los resultados históricos conservan
   sus notas anteriores hasta revalidación y se identifican como históricos, excluidos de SITA.

Los estados de cumplimiento y el índice combinado con estándares internacionales son
convenciones del proyecto, no escalas adicionales establecidas por este instructivo.

## Validación técnica

- Migraciones: `core.0009_lotaip_rubric` y `core.0010_add_no_verificable_status`.
- Pruebas: `backend/.venv/Scripts/python.exe backend/manage.py test core.tests.test_lotaip_rubric`.
- Frontend: `npm run build` dentro de `frontend`.
