# ADR 0004 · Importes en céntimos enteros

**Estado:** aceptada · 2026-09-24

## Decisión

Todo importe se guarda y calcula como entero en céntimos (`bigint` en PostgreSQL, tipo `Cents` en TypeScript). Los tipos de IVA y retención se expresan en puntos básicos (21 % = 2100) y se aplican con aritmética entera y redondeo "half away from zero".

## Por qué

Los números con decimales binarios no representan céntimos exactos (0,1 + 0,2 ≠ 0,3). En contabilidad, un céntimo de diferencia rompe un cuadre.
