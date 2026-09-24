# ADR 0006 · Terceros únicos y categorías por sociedad con clave de plantilla

**Estado:** aceptada · 2026-09-24

## Terceros

Un solo registro (`counterparties`) con los indicadores «es cliente» y «es proveedor», en lugar de dos tablas. Una misma empresa puede comprarnos y vendernos; así su NIF, IBAN e historial están en un solo sitio y la conciliación bancaria busca en un único lugar. El NIF es opcional (particulares, extranjeros) y único por sociedad y país.

## Categorías

Cada sociedad tiene su propia copia de las categorías, creada desde una plantilla basada en el Plan General Contable. Así cada cliente puede renombrar o añadir sin afectar a los demás.

Cada categoría de plantilla guarda una clave estable (`template_key`, p. ej. `suministros.electricidad`). Las reglas de la organización (bloque 6, «ENDESA → Electricidad») apuntarán a esa clave y funcionarán en todas las sociedades, aunque cada una tenga su propia categoría.

Solo dos niveles (principal y subcategoría): suficiente para una cuenta de resultados de pyme y mucho más fácil de mantener que un árbol libre.

## Integridad

Las claves foráneas no pasan por RLS. Unos triggers comprueban que una categoría principal o una categoría por defecto pertenecen a la misma sociedad, para que nadie pueda enlazar datos de otra sociedad conociendo su identificador.
