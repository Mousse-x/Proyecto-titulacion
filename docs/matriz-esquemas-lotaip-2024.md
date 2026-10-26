# Matriz de esquemas LOTAIP 2024

Fuente estructural: las 25 plantillas XLSX de `backend/media/templates`. Fuente de aplicabilidad: Tabla 7 y Anexo 1 de la Resolución 053-DPE-CGAJ-2024. Todos los campos listados son oficiales y requeridos. Un dato inexistente no se deja vacío: se registra `NO APLICA` o `INFORMACIÓN NO DISPONIBLE` con la nota aclaratoria exigida en el diccionario.

**Procedencia reproducible:** motor `DPE-053-2024-v2`; normativa `Resolución
053-DPE-CGAJ-2024`; archivo de configuración `schemas_2024.json`; origen estructural:
plantillas XLSX actualmente almacenadas en el repositorio. Cada evaluación registra el
checksum SHA-256 del archivo para identificar exactamente la revisión aplicada.

**Numeral 23:** la Tabla 7 marca “Estado de verificables = Sí”, mientras que la plantilla
oficial no contiene campos URL en datos ni metadatos. El motor no inventa un enlace ni
califica cero: devuelve `REQUIERE_REVISION`, sin incluir ese estado en el denominador de CI.

| Numeral | Formato(s) | Campos requeridos | Campos URL (datos + metadatos) | Verificables | Vigencia | Validez | Regla especial |
|---:|---|---:|---:|:---:|:---:|:---:|---|
| 1 | 1.1, 1.2, 1.3 | 11 | 3 | Sí | No | No | Reglas comunes |
| 2 | 2 | 9 | 0 | No | No | No | Reglas comunes |
| 3 | 3 | 12 | 0 | No | No | Sí | Suma de ingresos adicionales |
| 4 | 4 | 6 | 0 | No | No | No | Reglas comunes |
| 5 | 5-22 | 6 | 4 | Sí | No | No | Reglas comunes |
| 6 | 6 | 14 | 0 | No | No | Sí | Devengado + saldo por devengar = codificado |
| 7 | 7 | 8 | 3 | Sí | No | No | Reglas comunes |
| 8 | 8 | 10 | 2 | Sí | No | No | Reglas comunes |
| 9 | 9 | 6 | 1 | Sí | No | No | Reglas comunes |
| 10 | 10 | 5 | 2 | Sí | No | No | Reglas comunes |
| 11 | 11 | 13 | 1 | Sí | No | No | Reglas comunes |
| 12 | 12 | 4 | 2 | Sí | No | No | Reglas comunes |
| 13 | 13 | 8 | 2 | Sí | No | No | Reglas comunes |
| 14 | 14 | 7 | 4 | Sí | No | No | Reglas comunes |
| 15 | 15 | 5 | 2 | Sí | No | No | Reglas comunes |
| 16 | 16 | 5 | 3 | Sí | Sí | No | Vigencia de reserva; muestra reproducible de 3 filas |
| 17 | 17 | 11 | 1 | Sí | No | No | Reglas comunes |
| 18 | 18 | 6 | 1 | Sí | Sí | No | Vigencia del convenio; muestra reproducible de 3 filas |
| 19 | 19 | 5 | 1 | Sí | No | No | Reglas comunes |
| 20 | 20 | 4 | 2 | Sí | No | No | Reglas comunes |
| 21 | 21 | 5 | 2 | Sí | No | No | Reglas comunes |
| 22 | 5-22 | 6 | 4 | Sí | No | No | Reglas comunes |
| 23 | 23 | 2 | 0 | Sí | No | No | Reglas comunes |
| 24 | 24 | 2 | 1 | Sí | No | No | Reglas comunes |

## Numeral 1

### Formato 1.1
Plantilla: `1-1-estructura-organica.xlsx`

**Campos obligatorios:** Nivel superior; Unidad; Nivel de los Procesos de la Estructura Organica Funcional.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Enlace para consultar el organigrama estructural.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.

### Formato 1.2
Plantilla: `1-2-base-legal-regulaciones-procedimientos-internos.xlsx`

**Campos obligatorios:** Tipo; Descripcion; Enlace.

**Campos URL del conjunto:** Enlace.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.

### Formato 1.3
Plantilla: `1-3-metas-y-objetivos_unidades.xlsx`

**Campos obligatorios:** Unidad; Objetivo; Indicador; Meta cuantificable; Enlace al sistema de gestion de planificacion para verificacion de los indicadores y metas cuantificables.

**Campos URL del conjunto:** Enlace al sistema de gestion de planificacion para verificacion de los indicadores y metas cuantificables.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 2

### Formato 2
Plantilla: `2-directorio-y-distributivo-personal-de-la-entidad.xlsx`

**Campos obligatorios:** No.; Apellidos y Nombres; Puesto Institucional; Unidad a la que pertenece; Direccion institucional; Ciudad en la que labora; Teléfono institucional; Extension telefonica; Correo electronico institucional.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 3

### Formato 3
Plantilla: `3-remuneraciones-ingresos-adicionales.xlsx`

**Campos obligatorios:** Numeracion; Puesto Institucional; Regimen laboral al que pertenece; Numero de partida presupuestaria; Grado jerarquico o escala al que pertenece el puesto; Remuneracion mensual unificada; Remuneracion unificada - anual; Decimo Tercera Remuneracion; Decima Cuarta Remuneracion; Horas suplementarias y extraordinarias; Encargos y subrogaciones; Total ingresos adicionales.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Remuneracion mensual unificada; Remuneracion unificada - anual; Decimo Tercera Remuneracion; Decima Cuarta Remuneracion; Horas suplementarias y extraordinarias; Encargos y subrogaciones; Total ingresos adicionales.


## Numeral 4

### Formato 4
Plantilla: `4-detalle-licencia-comisiones.xlsx`

**Campos obligatorios:** Nombres y Apellidos; Puesto Institucional; Fecha de inicio; Fecha de fin; Lugar; Tipo.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Fecha de inicio; Fecha de fin.

**Campos monetarios:** Ninguno.


## Numeral 5

### Formato 5-22
Plantilla: `5-22-servicios-formularios-formatos-tramites.xlsx`

**Campos obligatorios:** Denominacion del servicio publico que se brinda; Enlace para acceder al reporte del servicio; Numero de personas que acceden mensualmente al servicio institucional; Enlace para descargar el formulario o formato del servicio - Correo electronico para solicitar el servicio; Enlace para el servicio por internet en linea; Porcentaje de satisfaccion sobre el uso del servicio.

**Campos URL del conjunto:** Enlace para acceder al reporte del servicio; Enlace para descargar el formulario o formato del servicio - Correo electronico para solicitar el servicio; Enlace para el servicio por internet en linea.

**Campos URL de metadatos:** Enlace a portal unico de tramites ciudadanos.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 6

### Formato 6
Plantilla: `6-presupuesto-de-la-institucion.xlsx`

**Campos obligatorios:** Cuenta; Categoria; Descripcion; Asignado; Modificado; Codificado; Monto certificado; Comprometido; Devengado; Pagado; Saldo por comprometer; Saldo por devengar; Saldo por pagar; Porcentaje de ejecucion.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Asignado; Modificado; Codificado; Monto certificado; Comprometido; Devengado; Pagado; Saldo por comprometer; Saldo por devengar; Saldo por pagar.


## Numeral 7

### Formato 7
Plantilla: `7-resultados-de-las-auditorias-internas-y-gubernamentales.xlsx`

**Campos obligatorios:** No.; Numero del informe; Tipo de examen; Nombre del examen; Período analizado; Area o proceso auditado; Enlace para descargar el informe especifico; Enlace para descargar el reporte de seguimiento al cumplimiento de recomendaciones del informe de auditoria.

**Campos URL del conjunto:** Enlace para descargar el informe especifico; Enlace para descargar el reporte de seguimiento al cumplimiento de recomendaciones del informe de auditoria.

**Campos URL de metadatos:** Enlace para descargar el reporte de seguimiento al cumplimiento de recomendaciones del informe de auditoria.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 8

### Formato 8
Plantilla: `8-procesos-de-contratacion-publica.xlsx`

**Campos obligatorios:** Fecha de publicacion; Codigo del proceso; Tipo de proceso; Objeto del proceso; Presupuesto referencial - USD; Partida presupuestaria; Monto de la adjudicacion - usd; Etapa de la contratacion; Identificacion del contratista; Link para descargar el proceso de contratacion desde el portal de compras publicas.

**Campos URL del conjunto:** Link para descargar el proceso de contratacion desde el portal de compras publicas.

**Campos URL de metadatos:** Enlace para la busqueda de procesos de contratacion desde el Sistema Oficial de Contratacion Publica.

**Campos de fecha:** Fecha de publicacion.

**Campos monetarios:** Presupuesto referencial - USD; Monto de la adjudicacion - usd.


## Numeral 9

### Formato 9
Plantilla: `9-listado-de-empresas-y-personas-que-han-incumplido-contratos.xlsx`

**Campos obligatorios:** No.; RUC - Numero Identificacion de la empresa o persona contratista; Numero de contrato - codigo del proceso de contratacion fallido o incumplido; Monto del contrato incumplido; Fecha desde; Fecha hasta.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Enlace para consulta de proveedores incumplidos y adjudicatarios fallidos del sistema oficial de contratacion publica.

**Campos de fecha:** Fecha desde; Fecha hasta.

**Campos monetarios:** Monto del contrato incumplido.


## Numeral 10

### Formato 10
Plantilla: `10-planes-y-programas.xlsx`

**Campos obligatorios:** Nombre del Plan o Programa; Período; Monto; Enlace al Plan o Programa; Enlace al estado.

**Campos URL del conjunto:** Enlace al Plan o Programa; Enlace al estado.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Monto.


## Numeral 11

### Formato 11
Plantilla: `11-contratos-de-credito-externos-o-internos.xlsx`

**Campos obligatorios:** Tipo de Contrato; Objeto; Fecha de suscripcion o renovacion; Nombre Deudor; Nombre Acreedor; Nombre Ejecutor; Tasa de Interes - %; Plazo; Fondos con los que se cancelara la obligacion crediticia; Enlace para descargar el contrato de credito externo o interno; Monto del prestamo o contrato; Desembolsos efectuados; Desembolsos por efectuar.

**Campos URL del conjunto:** Enlace para descargar el contrato de credito externo o interno.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Fecha de suscripcion o renovacion.

**Campos monetarios:** Monto del prestamo o contrato; Desembolsos efectuados; Desembolsos por efectuar.


## Numeral 12

### Formato 12
Plantilla: `12-mecanismos-rendicion-cuentas.xlsx`

**Campos obligatorios:** Nombre del mecanismo; Numero de certificado; Periodo; Enlace.

**Campos URL del conjunto:** Enlace.

**Campos URL de metadatos:** Enlace para la descarga de otros mecanismos de rendición de cuentas.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 13

### Formato 13
Plantilla: `13-viaticos-informes-de-trabajo-y-justificativos-de-movilizacion.xlsx`

**Campos obligatorios:** Nombres y apellidos; Puesto institucional; Tipo; Fecha de inicio del viaje; Fecha de fin del viaje; Motivo del viaje; Valor del viatico; Enlace para descargar el informe y justificativos.

**Campos URL del conjunto:** Enlace para descargar el informe y justificativos.

**Campos URL de metadatos:** Enlace para descargar el reporte consolidado de gastos de viaticos nacionales e internacionales.

**Campos de fecha:** Fecha de inicio del viaje; Fecha de fin del viaje.

**Campos monetarios:** Valor del viatico.


## Numeral 14

### Formato 14
Plantilla: `14-responsables-del-acceso-de-informacion-publica.xlsx`

**Campos obligatorios:** Nombres y apellidos; Denominacion del puesto; Responsabilidad LOTAIP; Direccion de la oficina; Numero telefonico; Extension telefonica; Correo electronico.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Enlace para descargar el acuerdo o resolucion de creacion del Comite de Transparencia; Enlace para descargar el acuerdo o resolucion para delegar el manejo de las solicitudes de acceso a la informacion publica en territorio; Enlace para la recepcion de solicitudes de acceso a la informacion publica por via electronica; Enlace para descargar el listado de responsables de atender las solicitudes de acceso a la informacion en las unidades desconcentradas.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 15

### Formato 15
Plantilla: `15-texto-integro-de-los-contratos-colectivos-vigentes-y-reformas.xlsx`

**Campos obligatorios:** Denominacion de la organizacion sindical; Fecha de suscripcion del contrato; Enlace para descargar el contrato colectivo original; Fecha de la ultima reforma o revision; Enlace para descargar todas las reformas completas del contrato colectivo.

**Campos URL del conjunto:** Enlace para descargar el contrato colectivo original; Enlace para descargar todas las reformas completas del contrato colectivo.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Fecha de suscripcion del contrato; Fecha de la ultima reforma o revision.

**Campos monetarios:** Ninguno.


## Numeral 16

### Formato 16
Plantilla: `16-indice-informacion-reservada.xlsx`

**Campos obligatorios:** Tema; Numero de Resolucion; Fecha de la clasificacion de la informacion reservada; Periodo de vigencia de la clasificacion de la reserva; Enlace para descargar la resolucion de clasificacion de informacion reservada.

**Campos URL del conjunto:** Enlace para descargar la resolucion de clasificacion de informacion reservada.

**Campos URL de metadatos:** Enlace para descargar el listado indice de informacion reservada - certificado de cumplimiento; Enlace para descargar el listado índice de información reservada - reporte del literal c del Sistema de la Defensoría del Pueblo de Ecuador.

**Campos de fecha:** Fecha de la clasificacion de la informacion reservada.

**Campos monetarios:** Ninguno.


## Numeral 17

### Formato 17
Plantilla: `17-audiencias-y-reuniones-autoridades.xlsx`

**Campos obligatorios:** Nombres y Apellidos; Puesto institucional; Asunto; Fecha de la audiencia o reunion; Modalidad; Lugar; Descripcion de la audiencia o reunion; Duracion; Nombre de personas externas; Institucion externa; Enlace para descargar el registro de asistencia de las personas que participaron en la reunion o audiencia.

**Campos URL del conjunto:** Enlace para descargar el registro de asistencia de las personas que participaron en la reunion o audiencia.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Fecha de la audiencia o reunion.

**Campos monetarios:** Ninguno.


## Numeral 18

### Formato 18
Plantilla: `18-detalle-de-convenios-nacionales-e-internacionales.xlsx`

**Campos obligatorios:** Tipo; Fecha de suscripcion; Objeto; Nombre de la organizacion, persona natural o persona juridica; Plazo de duracion; Enlace para descargar el convenio.

**Campos URL del conjunto:** Enlace para descargar el convenio.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Fecha de suscripcion.

**Campos monetarios:** Ninguno.


## Numeral 19

### Formato 19
Plantilla: `19-detalle-donativos-oficiales-y-protocolares.xlsx`

**Campos obligatorios:** Fecha; Descripcion; Ocasion o motivo; Persona natural o jurídica; Enlace para descargar el documento mediante el cual se oficializa el regalo o donativo.

**Campos URL del conjunto:** Enlace para descargar el documento mediante el cual se oficializa el regalo o donativo.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Fecha.

**Campos monetarios:** Ninguno.


## Numeral 20

### Formato 20
Plantilla: `20-registro-de-activos-de-informacion-frecuente-y-complementaria.xlsx`

**Campos obligatorios:** Tema; Numero de requerimientos; Enlace para descargar el detalle de la informacion solicitada frecuentemente; Enlace para descargar la solicitud de informacion complementaria que haya sido solicitada recurrentemente.

**Campos URL del conjunto:** Enlace para descargar el detalle de la informacion solicitada frecuentemente; Enlace para descargar la solicitud de informacion complementaria que haya sido solicitada recurrentemente.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 21

### Formato 21
Plantilla: `21-politicas-publicas-o-informacion-grupo-especifico.xlsx`

**Campos obligatorios:** Grupo especifico; Nombre de politica publica; Fase; Fecha; Enlace a informe.

**Campos URL del conjunto:** Enlace a informe.

**Campos URL de metadatos:** Enlace para descargar las acciones y buenas prácticas de actores sociales e interinstitucionales que vigilan el cumplimiento de la politica publica.

**Campos de fecha:** Fecha.

**Campos monetarios:** Ninguno.


## Numeral 22

### Formato 5-22
Plantilla: `5-22-servicios-formularios-formatos-tramites.xlsx`

**Campos obligatorios:** Denominacion del servicio publico que se brinda; Enlace para acceder al reporte del servicio; Numero de personas que acceden mensualmente al servicio institucional; Enlace para descargar el formulario o formato del servicio - Correo electronico para solicitar el servicio; Enlace para el servicio por internet en linea; Porcentaje de satisfaccion sobre el uso del servicio.

**Campos URL del conjunto:** Enlace para acceder al reporte del servicio; Enlace para descargar el formulario o formato del servicio - Correo electronico para solicitar el servicio; Enlace para el servicio por internet en linea.

**Campos URL de metadatos:** Enlace a portal unico de tramites ciudadanos.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 23

### Formato 23
Plantilla: `23-detalle-personas-servidoras-publicas-con-acciones-afirmativas.xlsx`

**Campos obligatorios:** Accion afirmativa; No. de personas con acciones afirmativas.

**Campos URL del conjunto:** Ninguno.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.


## Numeral 24

### Formato 24
Plantilla: `24-informacion-relevante-para-el-ejercicio-de-derechos-ods.xlsx`

**Campos obligatorios:** Informacion relevante; Enlace para descargar.

**Campos URL del conjunto:** Enlace para descargar.

**Campos URL de metadatos:** Ninguno.

**Campos de fecha:** Ninguno.

**Campos monetarios:** Ninguno.
