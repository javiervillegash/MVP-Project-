# Cambios

## 0.3.0 · 2026-09-24 · Fase 1, bloque 3: clientes, proveedores y categorías

- Cada sociedad tiene ahora su espacio con pestañas: Datos, Clientes y proveedores, Categorías.
- Clientes y proveedores: un único registro por tercero (puede ser ambos), NIF español validado o identificador extranjero, IBAN con dígito de control, plazo de cobro/pago, categoría habitual de ingreso y de gasto, notas. Filtro por tipo, buscador por nombre o NIF, archivo.
- Categorías: plantilla del Plan General Contable (cuenta orientativa y línea de la cuenta de resultados) que se copia a cada sociedad nueva; alta, edición y archivo; dos niveles. Clave estable de plantilla para las reglas automáticas del bloque 6.
- Integridad reforzada en la base de datos: no se puede enlazar una categoría de otra sociedad aunque se conozca su id.
- Los desplegables de los formularios conservan lo elegido tras un error.
- Datos de demostración con categorías y terceros de ejemplo.

## 0.2.0 · 2026-09-24 · Fase 1, bloque 2: clientes, sociedades y usuarios

- Clientes: alta, edición, archivo y reactivación; paquete, precio pactado (obligatorio en Finance Department) y gestor responsable. Resumen de ingresos mensuales por paquetes.
- Sociedades: alta y edición con NIF validado según la forma (DNI/NIE para autónomos, NIF de persona jurídica para sociedades), régimen y periodicidad de IVA, inicio de ejercicio. Archivar un cliente archiva sus sociedades.
- Usuarios: invitar con contraseña temporal mostrada una sola vez, dar y retirar accesos por cliente o por sociedad; protección del último Administrador.
- Seguridad: bloqueo por cuenta tras 5 fallos (además del límite por IP); cambio obligatorio de contraseña temporal; cambio voluntario cerrando las demás sesiones.
- Menú según permisos, páginas de error y "no encontrado" en español; los formularios conservan lo escrito si hay errores.
- 168 tests.

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
