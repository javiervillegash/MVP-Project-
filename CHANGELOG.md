# Cambios

## 0.1.0 · 2026-09-24 · Fase 1, bloque 1: base

- Proyecto Next.js 15 + TypeScript + Drizzle + PostgreSQL 16.
- Tablas de organizaciones, clientes, sociedades y membresías.
- Row-Level Security en todas las tablas de negocio y rol de aplicación sin privilegios.
- Autenticación con Better Auth: sin registro público, 2FA (TOTP y códigos de recuperación), obligatorio para Administrador y Gestor, límite de 5 intentos cada 15 minutos por IP.
- Matriz de permisos por rol y paquetes comerciales con límites.
- Auditoría automática e inmutable por trigger.
- Utilidades de dinero en céntimos y validación de NIF/NIE/CIF.
- Pantallas: login, verificación 2FA, activación 2FA, inicio con sociedades visibles.
- Scripts de migración, rol de aplicación, alta inicial y datos de demostración.
- CI con tipos, lint, formato, 143 tests contra PostgreSQL real y build.
