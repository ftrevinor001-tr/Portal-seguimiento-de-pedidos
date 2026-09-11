# Reglas de cálculo

Todos los campos calculados se obtienen **al momento**, con la fecha de hoy, en `assets/js/calc.js`. No se guardan en la base.

## Campos calculados

| Campo | Regla |
|---|---|
| **ALERTA** | Sin fecha estimada → `SIN FECHA` (o `CANCELADO` si está cancelada). STATUS = CANCELADO → `CANCELADO`. Con fecha real: ≤ estimada → `FINALIZADO`; > estimada → `FUERA DEL PLAZO`. Sin fecha real: estimada < hoy → `FUERA DEL PLAZO`; faltan menos de 5 días → `NOTIFICAR`; si no → `DENTRO DEL PLAZO`. |
| **Días de incumplimiento** | Ya llegó → `CERRADO`. No ha llegado y la estimada ya pasó → días hábiles (L-V, sin inhábiles) de la fecha estimada a hoy, contando ambos días (como NETWORKDAYS). |
| **Días naturales** | Fecha estimada − fecha de solicitud. |
| **Días reales de entrega** | Fecha real de llegada − fecha de solicitud. |
| **Existencia** | Clave buscada en el maestro de artículos (EXIUNIBAS). |
| **INV** | Existencia > 0 y clave numérica o NUEVO → `CON INV`; si no → `SIN INV`. |
| **Estatus facturación (calc.)** | Capturado CANCELADO o TERMINADO se respeta; si hay fecha de facturación → `TERMINADO`; si no → `PENDIENTE`. |
| **Clasificación** | TIPO DE SOLICITUD + "-" + ÁREA. |
| **% pago mínimo** | Costo total > $200,000 → 70%; si no → 100%. |
| **Cumple política** | Solo para "SOBREPEDIDO - VENTA REAL": cotización = SI, factura al cliente = SI y % pagado ≥ mínimo → `CUMPLE`; si falta algo → `PENDIENTE`. Para otras clasificaciones → `NO APLICA`. |

## Status del pedido vs. fecha real de llegada
- **STATUS DEL PEDIDO** (PENDIENTE / FINALIZADO / ENTREGADO / CANCELADO) es un campo **capturado**.
- **ALERTA**, **días de incumplimiento** y los reportes de cumplimiento se calculan con la **FECHA REAL DE LLEGADA**:
  - con fecha real, la clave ya llegó;
  - sin fecha real, sigue pendiente.
- **Sincronización automática** (en el detalle y en "Editar seleccionados"):
  - Si se captura fecha real y el status es PENDIENTE, cambia a FINALIZADO (Sobrepedido) o ENTREGADO (Entregas directas / Tickets).
  - Si se **borra** la fecha real y el status es FINALIZADO o ENTREGADO, regresa a PENDIENTE.
  - Si en el mismo cambio se elige el status a mano, se respeta lo elegido. CANCELADO nunca se modifica solo.
- **Filtro "Revisión"** en Seguimiento: encuentra claves "finalizado/entregado sin fecha real" y "pendiente con fecha real" para corregirlas.

## Comprador (Nuevo pedido) — v1.0.5
El comprador **no está amarrado a la clave**. En *Datos generales → Asignación del comprador* hay dos opciones (la app recuerda la última que usaste):

- **Según las claves** (sugerido):
  - Cada clave toma el comprador del maestro de artículos (`sp_articulos.comprador`) en la columna *Comprador* de la tabla, donde se puede cambiar libremente.
  - El campo **Comprador asignado** se llena solo (no se escribe): muestra el comprador de las claves o "VARIOS: A, B" si son de compradores distintos.
  - Claves NUEVO o sin comprador en el maestro toman el comprador de las demás claves cuando todas comparten uno; si hay varios, se escribe en la tabla.
  - Si la clave tiene dos compradores en el maestro ("A | B") se propone el primero y se muestra "Maestro: A / B" como referencia.
  - Un mismo folio puede quedar con claves de varios compradores; cada clave se guarda con el suyo.
- **Manual**:
  - Se escribe el **Comprador asignado** y se guarda en **todas** las claves del pedido. Al cambiar a Manual se propone el comprador de las claves (se puede borrar o cambiar).
  - La columna "Comprador en maestro" es solo de referencia.
- **Qué se exige**: únicamente que cada clave termine con algún comprador. No hay bloqueo por diferencias con el maestro: solo se muestra una nota de referencia.
- **Registros anteriores**: el comprador guardado en cada pedido **no cambia** al actualizar el maestro de artículos (esa carga solo modifica `sp_articulos`). Si alguien cambió de cartera o dejó la empresa, los pedidos históricos conservan a quien los compró. Solo cambia si alguien lo edita a mano en el detalle o en "Editar seleccionados".
- **Origen del dato del maestro**: *Datos y bitácora → Actualizar maestro de artículos* con un archivo que tenga CLAVE (o IDARTICULO) y COMPRADOR, como la hoja EXISTENCIAS. Claves repetidas con compradores distintos se guardan como "A | B"; los valores 0 se consideran sin comprador.

## Fecha estimada (al capturar o editar)
- **Días**: se toman del catálogo *Tiempos de entrega* (proveedor + solicitante) o del texto "DE 10 A 15 DIAS".
- **Entrega directa y tickets**:
  - Fecha estimada inicio = solicitud + días A.
  - Fecha estimada fin = solicitud + días B.
  - Los días son naturales o hábiles, según el catálogo.
- **Sobrepedido y pedido especial**: fecha estimada de llegada = solicitud + días B en **días hábiles** (L-V, sin días inhábiles).
- **Fecha manual**: si alguien escribe la fecha a mano queda marcada como "manual" y ya no se recalcula.

## Calendario de Entregas Directas
- **Claves del día**: cuentan en un día si la ventana [fecha estimada inicio, fecha estimada fin] incluye ese día, no están canceladas y aún no tienen fecha real de llegada.
- **Horas por folio**: tiempo de descarga del folio. Las horas del día son la suma de los folios.
- **Nivel de carga**: Sin carga (0 h) · Baja (< 4 h) · Media (4 a 7.9 h) · Alta (≥ 8 h). Los umbrales se ajustan en `config.js`.
- **KPIs del mes**:
  - Folios y horas: todos los folios cuya ventana toca el mes.
  - % de entregas: claves con fecha real / claves no canceladas.

## Reporte Compradores
- **Qué claves entran**: las del tipo de solicitud elegido cuya ventana de fecha estimada toca el mes.
- **Categorías**: dentro del plazo, fuera del plazo y pendientes vencidas. Entre las tres suman 100%.
- **Qué se excluye**: pendientes dentro del plazo y canceladas.

## Validación (septiembre 2026)

`tests/reglas.test.js` recalcula todo con el archivo de carga inicial y lo compara contra el Excel y contra las pantallas de la app anterior:

| Prueba | Resultado |
|---|---|
| ALERTA vs fórmula del Excel (SOBREPEDIDO filas ≥906 y BASE PRINCIPAL filas ≥956) | 100% (5,784 filas) |
| Existencia, % pago mínimo | 100% |
| Estatus de facturación, clasificación, días naturales (Sobrepedido) | 99.5% – 99.8% (las diferencias vienen de fechas corregidas en la limpieza y de filas sin fórmula) |
| Calendario sept-2026: folios, proveedores y horas por día vs pantalla anterior | 26 de 26 días idénticos |
| KPIs del calendario: 107 folios, 237 h, 68.8% de entregas | Idénticos |
| Compradores ENTREGA DIRECTA sept-2026: 251 dentro, 0 fuera, 0 vencidas | Idéntico |

**Diferencias conocidas:**
- **Proveedores del mes en el calendario**: la app muestra 16 y la pantalla anterior 17. La app cuenta las marcas de las claves no canceladas.
- **Días naturales en BASE PRINCIPAL**: el Excel tenía valores capturados a mano (72% coincide con la fórmula). La app usa la misma fórmula para todos.

Para correr la prueba: `node tests/reglas.test.js carga_inicial.xlsx valid.json`.
