# ADR 0003 · Auditoría por trigger de base de datos

**Estado:** aceptada · 2026-09-24

## Decisión

Los cambios en tablas de negocio se registran en `audit_log` mediante un trigger (`app.audit_row`), no desde el código. El registro guarda usuario, operación, campos cambiados y valores antes y después.

- Si no hay usuario en el contexto (`app.user_id`) ni proceso declarado (`app.system_actor`), el cambio se rechaza.
- `finanzas_app` no puede insertar, modificar ni borrar en `audit_log`; un trigger impide modificarlo incluso al propietario.
- Los datos maestros no se borran: la app no tiene permiso DELETE sobre organizaciones, clientes ni sociedades.

## Alternativa descartada

Auditar desde el código: basta un olvido para perder el rastro.
