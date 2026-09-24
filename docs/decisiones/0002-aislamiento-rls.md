# ADR 0002 · Aislamiento multiempresa con tablas compartidas y Row-Level Security

**Estado:** aceptada · 2026-09-24

## Decisión

Todas las organizaciones comparten tablas. Cada fila lleva `organization_id` (y `legal_entity_id` si aplica). El aislamiento tiene dos cerrojos:

1. La aplicación solo accede a datos a través de `withDbContext()`, que fija el contexto de seguridad de la transacción.
2. PostgreSQL aplica políticas RLS a `finanzas_app`, un rol sin privilegios para saltárselas. Sin contexto, las tablas devuelven cero filas.

Los permisos efectivos de un usuario se calculan con `app.my_grants()`, que solo devuelve filas del propio usuario.

## Alternativas descartadas

- Una base de datos por cliente: aislamiento máximo, pero cada migración se multiplica por el número de clientes y el panel de cartera se complica mucho.
- Un esquema por cliente: el mismo problema a partir de unas decenas de clientes.

## Consecuencias

- Un error en el código (un filtro olvidado) no expone datos de otro cliente.
- El panel de cartera puede consultar muchas sociedades con una sola consulta.
- Cada tabla nueva necesita su política RLS; hay tests que lo comprueban.
