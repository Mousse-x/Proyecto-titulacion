# Referencia internacional

Cada archivo `<SIGLA>-<año>.csv` es una referencia documental de los indicadores
internacionales y mixtos que no se miden técnicamente: una fila por indicador con el
estado esperado (`CUMPLE`, `PARCIAL`, `NO_CUMPLE` o `SIN_EVIDENCIA`), un estado
alternativo también defendible en casos límite, la URL de la evidencia y una nota.

## Método (referencias 2025)

- Fuentes: el portal institucional, su repositorio de resoluciones, el informe de
  rendición de cuentas 2025 (que cubre enero a diciembre de 2025) y documentos públicos
  enlazados desde esas páginas. Se revisaron en octubre de 2026.
- Solo cuenta la información de libre acceso: un documento alojado en SharePoint u
  OneDrive que exige iniciar sesión no acredita el criterio.
- Un documento expedido después del período (por ejemplo, un código de ética de 2026)
  no acredita el año 2025.
- Si no se encontró evidencia, el indicador queda `SIN_EVIDENCIA` con la explicación;
  nunca se supone.
- IND-55 (accesibilidad WCAG), IND-57 (interoperabilidad) e IND-58 (datos abiertos) no
  forman parte del CSV: se miden con el motor técnico sobre las copias archivadas del
  portal al cierre del año y sobre los paquetes LOTAIP descargados.

Es una investigación documental asistida, no una auditoría oficial; conviene revisar una
muestra antes de citarla.

## Uso

```bash
.venv\Scripts\python.exe manage.py cargar_referencia --anio 2025
.venv\Scripts\python.exe manage.py compare_reference
```

`cargar_referencia` reemplaza el resultado anual de esos indicadores (marcado como
`referencia_documental`) y recalcula los índices. `EPN-2026.csv` es la referencia usada
para medir el acuerdo del motor automático en 2026.
