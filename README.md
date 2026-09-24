# Plataforma Financiera

Plataforma multiempresa de administración, contabilidad operativa y control financiero para autónomos y pymes en España. Una firma administradora gestiona desde aquí a todos sus clientes; cada cliente ve solo lo suyo.

> **Estado:** Fase 1 (MVP), bloque 1 de 9 completado: base del proyecto, aislamiento multiempresa, autenticación con 2FA, permisos y auditoría.

## Qué hay construido

| Pieza                                                         | Estado                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Jerarquía Organización → Cliente → Sociedad                   | Tablas, validación de NIF, archivado en lugar de borrado                                         |
| Aislamiento entre clientes                                    | Doble cerrojo: filtro en la app + Row-Level Security en PostgreSQL                               |
| Roles y permisos                                              | 5 roles, matriz única `can()`, ámbito por cliente o por sociedad                                 |
| Paquetes (Esencial, Profesional, Empresa, Finance Department) | Funciones y límites blandos/duros (sin pantalla de administración todavía)                       |
| Autenticación                                                 | Email + contraseña, sin registro público, 2FA obligatorio para el equipo, 5 intentos cada 15 min |
| Auditoría                                                     | Automática por trigger: usuario, campos y valores antes/después; inmutable                       |
| Importes                                                      | Céntimos enteros, redondeo de IVA exacto, lectura de importes en formato español                 |
| Pantallas                                                     | Login, verificación 2FA, activación 2FA, inicio con las sociedades visibles                      |
| CI                                                            | Tipos, lint, formato, 143 tests contra PostgreSQL real y build                                   |

## Puesta en marcha (desarrollo)

Requisitos: Node 22+ y PostgreSQL 16+.

```bash
npm install
cp .env.example .env            # y rellena BETTER_AUTH_SECRET (openssl rand -base64 32)
createdb finanzas_dev
createdb finanzas_test
npm run db:migrate              # tablas, RLS, triggers y rol finanzas_app
npm run db:roles                # activa el login de finanzas_app con APP_DB_PASSWORD
npm run db:seed                 # datos de demostración (opcional)
npm run dev
```

Usuarios de demostración (contraseña `demo-password-2026`):

| Email                   | Rol                     | Ve                                      |
| ----------------------- | ----------------------- | --------------------------------------- |
| admin@demo.local        | Administrador           | Todo (se le pedirá activar 2FA)         |
| gestor@demo.local       | Gestor del Grupo Alfa   | 2 sociedades (se le pedirá activar 2FA) |
| director@alfa.local     | Director del Grupo Alfa | 2 sociedades                            |
| gestoria@asesores.local | Gestoría                | 1 sociedad                              |

### Alta en un entorno nuevo (producción)

```bash
npm run db:migrate && npm run db:roles
npm run bootstrap -- --org "Nombre de la firma" --email admin@firma.es --name "Nombre Apellido"
```

Muestra una contraseña temporal una sola vez. El Administrador activa 2FA en su primer acceso.

## Comandos

| Comando               | Qué hace                                                    |
| --------------------- | ----------------------------------------------------------- |
| `npm run check`       | Tipos + lint + formato + tests (lo mismo que CI)            |
| `npm test`            | Tests. Recrea `finanzas_test` desde cero en cada ejecución  |
| `npm run db:generate` | Genera una migración a partir de cambios en `src/db/schema` |
| `npm run db:migrate`  | Aplica migraciones pendientes                               |

## Cómo está organizado

```
src/
  app/            rutas Next.js (solo interfaz)
  modules/
    access/       permisos (can), contexto de acceso, paquetes
    identity/     sesión y alta de usuarios
    tenancy/      organizaciones, clientes, sociedades
  db/
    schema/       tablas (Drizzle)
    migrations/   SQL versionado; 0001 contiene RLS y auditoría
    tenant.ts     withDbContext(): única puerta a los datos de negocio
  lib/            dinero, NIF, autenticación
tests/
  unit/           dinero, NIF, matriz de permisos, paquetes
  db/             aislamiento multiempresa, auditoría, autenticación
docs/decisiones/  decisiones de arquitectura (ADR)
```

## Reglas para añadir una tabla de negocio

1. Debe tener `organization_id` y, si pertenece a una sociedad, `legal_entity_id`.
2. En su migración: `ENABLE ROW LEVEL SECURITY`, una política con `app.can_see_entity(organization_id, legal_entity_id)` y `SELECT app.enable_audit('tabla')`.
3. Importes en céntimos (`bigint`), nunca `float`.
4. Si se olvida el punto 2, dos tests fallan: comprueban que toda tabla con `organization_id` tiene RLS y auditoría.

## Seguridad

- La app se conecta como `finanzas_app`, que no puede saltarse RLS ni tocar la auditoría. Las migraciones usan otro usuario.
- Cada transacción fija su contexto (`app.user_id`, `app.org_id`, sociedades visibles) con `set_config(..., true)`, que caduca al terminar la transacción.
- Un cambio en datos críticos sin usuario responsable se rechaza en la propia base de datos.
- En PostgreSQL los roles son de todo el servidor: desarrollo y test comparten la contraseña de `finanzas_app`.
- Pendiente (bloque 2): bloqueo por cuenta además de por IP. Hoy el límite de 5 intentos se aplica por IP, así que en una oficina con una sola IP pública afecta a todos.
