# ADR 0005 · El MVP registra facturas; la emisión con VERI\*FACTU llega en la Fase 4

**Estado:** aceptada · 2026-09-24

## Contexto

Un programa que emite facturas es un sistema informático de facturación sujeto al RD 1007/2023 (VERI\*FACTU). Tras el RDL 15/2025, es obligatorio desde el 1 de enero de 2027 para contribuyentes del Impuesto sobre Sociedades y desde el 1 de julio de 2027 para el resto.

## Decisión

En el MVP la plataforma registra facturas emitidas con otros programas. La emisión propia con VERI\*FACTU se implementará en la Fase 4. El modelo de factura reservará desde el inicio serie, numeración correlativa y campos de huella y QR, para no rehacer nada.
