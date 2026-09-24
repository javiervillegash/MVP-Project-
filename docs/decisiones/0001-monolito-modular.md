# ADR 0001 · Monolito modular con Next.js, TypeScript y PostgreSQL

**Estado:** aceptada · 2026-09-24

## Contexto

Cientos de sociedades, un equipo pequeño y datos financieros. Prioridades: seguridad, mantenimiento sencillo y coste razonable.

## Decisión

Una sola aplicación Next.js (App Router) en TypeScript, con módulos de negocio en `src/modules`, PostgreSQL 16 y Drizzle ORM. Autenticación con Better Auth, alojada en nuestra propia base de datos.

## Alternativas descartadas

- Microservicios: más coste y más puntos de fallo sin beneficio con este volumen.
- Backend separado (NestJS): más código y dos despliegues; se puede extraer más adelante si hace falta.
- Prisma: encaja peor con RLS y con consultas de informes en SQL explícito.
- Autenticación de terceros (Clerk, Auth0): datos de usuarios fuera y coste por usuario.
