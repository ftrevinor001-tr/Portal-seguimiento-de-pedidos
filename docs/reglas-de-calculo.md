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

## Horario laboral del reloj de tickets (v1.7.0)

Todas las etapas 1 a 5 del ticket se miden en **horas hábiles**, no en días ni en horas corridas:

- **Jornada**: 8:00 a 13:30 y 15:00 a 18:00 = **8.5 horas**, de **lunes a viernes**, sin los **días inhábiles** del catálogo.
- Lo que cae fuera de ese horario **no cuenta**: un ticket levantado el **viernes a las 17:00** consume 1 hora ese día y sigue contando el **lunes a las 8:00** (1 día laboral se cumple el lunes a las 17:00).
- Si el ticket se levanta fuera de horario (7:00, 19:00, sábado o festivo), el reloj arranca en el **siguiente instante hábil**.
- Los **días de cotización** de cada categoría se convierten a horas: 1 día = 8.5 h, 3 días = 25.5 h, 5 días = 42.5 h.
- Se cambia en `config.js` con `HORARIO: { jornada: [['08:00','13:30'], ['15:00','18:00']] }`.
- Funciones: `C.horasHabiles(desde, hasta, inhábiles)`, `C.sumaHorasHabiles(desde, horas, inhábiles)`, `C.inicioHabil(fecha)`, `C.horasDia()`, `C.diasAHoras(d)`. Pruebas: `node tests/horario.test.js` (42 verificaciones).

## Etapas del TICKET (v1.3.0, medición en horas hábiles desde v1.7.0)

| # | Etapa | Del … al … | Responsable | Meta |
|---|---|---|---|---|
| 1 | Asignación | Fecha y hora de solicitud → **fecha y hora de asignación** | Jefe de área | 8.5 h hábiles (1 día laboral) |
| 2 | Cotización | Asignación → **entrega de la cotización al usuario**, contra la **fecha y hora límite** | Comprador | días de la categoría × 8.5 h |
| 3 | Recotización | Vencimiento de la cotización → **entrega de la re-cotización** | Comprador | 17 h hábiles (2 días) |
| 4 | Autorización | Cotización entregada → **autorización de compra** | Usuario | 25.5 h hábiles (3 días) |
| 5 | Pago | Autorización → **pago al proveedor** | Administración | 17 h hábiles (2 días) |
| 6 | Llegada | Pago → **fecha real de llegada** (contra la fecha estimada) | Proveedor | 15 días hábiles |

- **Tiempo de asignación**: horas **hábiles** entre la solicitud y la asignación (v1.7.0; antes eran horas corridas como en el Excel). Las fechas capturadas sin hora empiezan a contar a las 8:00.
- **Fecha y hora límite de cotización** = solicitud + (días de la categoría × 8.5) horas hábiles. La categoría sale de Catálogos → *Categorías de tickets*. El campo "Fecha límite de cotización (manual, opcional)" solo se usa para **forzarla**: si está vacío el portal la calcula sola, y si tiene fecha se entiende como el cierre de ese día (18:00). Los tickets del reporte histórico traen esa fecha capturada, así que conservan su límite original.
- **Horas restantes**: la tabla y el detalle muestran las horas hábiles que faltan para el límite (en rojo si ya venció).
- **ALERTA COTIZACIÓN**: cancelado → `CANCELADO`; sin fecha límite → `SIN FECHA LIMITE`; con entrega: después del límite → `FUERA DEL PLAZO`, si no `FINALIZADO` (si la entrega se capturó sin hora solo se comparan las fechas); sin entrega: ya pasó la hora límite → `FUERA DEL PLAZO`, el límite es hoy → `VENCE HOY`, quedan 8.5 h hábiles o menos → `POR VENCER`, si no `EN TIEMPO`.
- **ALERTA COMPRA** (igual que el Excel): cancelado → `CANCELADO`; sin autorización → `SIN AUTORIZACION DE COMPRA`; sin fecha estimada → `SIN FECHA ESTIMADA`; con llegada real: después de la estimada → `FUERA DEL PLAZO`, si no `FINALIZADO`; sin llegada: mismo criterio contra la fecha estimada.
- **Días fuera de plazo** = (llegada real o hoy) − fecha estimada, en días naturales, nunca negativo.
- **Validación de tiempo**: `PENDIENTE DE ASIGNACION` si falta la asignación, `REVISAR FECHA/HORA` si la asignación es anterior a la solicitud (se revisa con el reloj de pared, no con el horario), si no `OK`.
- **Recotización**: sigue inactiva hasta que la cotización entregada **vence sin autorización de compra**. El vencimiento solo existe si se captura la vigencia (días) o la fecha de vencimiento; los tickets históricos, que no la traen, no se marcan solos.
- **Etapa actual**: POR ASIGNAR → EN COTIZACIÓN → ESPERA DEL USUARIO → (POR RECOTIZAR) → POR PAGAR → EN SURTIMIENTO → ENTREGADO; cancelado aparte.
- **Captura por ticket**: las fechas de etapas son del folio completo; se capturan en el detalle de cualquier renglón y se guardan en todos los del ticket.
- **Metas**: `config.js` → `METAS_TICKET: { asignacion_horas: 8.5, recotizacion_horas: 17, autorizacion_horas: 25.5, pago_horas: 17, cotizacion: 3, entrega: 15, vigencia: 15, avisar_vence: 3 }` (las que terminan en `_horas` son horas hábiles; `entrega` y `vigencia`, días).

### Carga del reporte
*Datos y bitácora → Tickets · reporte*: se sube el archivo con la hoja **BASE DE DATOS**. El portal da de baja los tickets que ya tiene (quedan en "Ver dados de baja" y en la bitácora), carga los del archivo y, si viene la hoja de categorías, actualiza los días de cotización. Al cargar se corrige el AÑO con la fecha de solicitud, se aceptan fechas escritas a mano tipo "22 DE AGOSTO 26" y se unifican los nombres escritos distinto: comprador JULISSA YAJAIRA → JULISSA YAHAIRA MEZA; solicitantes RH → RECURSOS HUMANOS, CALIDAD → CONTROL DE CALIDAD y ADMINISTRATIVO → ADMINISTRACION. VICTORIA MIRANDA y MARIA VICTORIA son personas distintas y se dejan separadas.

### Validación contra el reporte (18/09/2026, 235 renglones)
`node tests/tickets.test.js "REPORTE DE TICKETS 2026.xlsx"`

| Columna del reporte | Coincidencia |
|---|---|
| VALIDACION TIEMPO | 88/88 = 100% |
| DÍAS FUERA DE PLAZO | 57/57 = 100% |
| ALERTA COTIZACION | 234/235 = 99.6% |
| ALERTA COMPRA | 222/226 = 98.2% |

Las 5 diferencias son renglones donde la alerta del Excel está escrita a mano (sin fórmula) y quedó con valores viejos: "TERMINADO" y "DENTRO DEL PLAZO", que ya no existen en la fórmula actual.

**TIEMPO DE ASIGNACION** ya no se compara contra el Excel: desde la v1.7.0 son horas hábiles. En los 222 tickets medidos el promedio baja de **3.6 h corridas a 0.8 h hábiles**, ninguno sube, y 220 de 222 (99.1%) quedan dentro de la meta de 8.5 h.

## Vista compacta (v1.8.0)
- Objetivo: ver **al menos 8 renglones** de la tabla con el navegador al 100 %, también en equipos con Windows al 125-150 %.
- Encabezado más delgado (el subtítulo queda como texto de ayuda al pasar el mouse). En las pantallas de tabla se oculta el pie de página; la hora de la última carga queda en el botón **⟳ Actualizar** (al pasar el mouse).
- Filtros en una sola línea: **Buscar, Año, Mes, Comprador, Status y Alerta** (en Tickets: Buscar, Año, Mes, Comprador, Etapa y Alerta de cotización). El resto está en **Más filtros ▾**, que se abre y cierra y se recuerda por pestaña; si hay un filtro activo escondido, el botón muestra cuántos.
- El **resumen** (KPIs) ya no ocupa una tarjeta: el resumen corto va en el pie de la tabla con el botón **Ver resumen**, que abre los KPIs arriba de la tabla. Empieza cerrado.
- Renglones de ~28 px (letra de 12.5 px).
- **⤢ Pantalla completa** (en el pie de la tabla): esconde encabezado y filtros; **Esc** para salir.
- Medido con 1920×1080 y Windows al 150 %: antes 1 a 3 renglones (y la página se desplazaba), ahora 14 en Sobrepedido/Entregas y 15 en Tickets; 21 en pantalla completa. Laptop pequeña (1366×768 al 125 %): 8 y 11.

## Pantallas (v1.6.0)
- Hay una pestaña por módulo: **Sobrepedido** (sobrepedido, pedido especial y sucursal entrega directa) y **Entregas directas**. Los tickets siguen en su propia pestaña. La dirección anterior `#/seguimiento` lleva a Sobrepedido.
- Las tres tablas (Sobrepedido, Entregas directas y Tickets) se ven **como una hoja de Excel**: ya no hay botones "Anterior/Siguiente"; al bajar con el scroll se agregan los renglones siguientes de 150 en 150 y el pie indica cuántos se están mostrando. El botón **Mostrar todos** pinta de golpe todos los renglones del filtro (útil para buscar con Ctrl+F).
- La casilla del encabezado selecciona **todos los renglones del filtro**, no solo los que están a la vista.
- La pantalla no se desplaza: se desplaza **la tabla**, así el panel de filtros y los títulos de las columnas quedan siempre a la vista. La primera columna del tablero de tickets (el folio) queda fija al mover la tabla a los lados.
- El **Resumen** (KPIs) de cada pestaña se puede ocultar con un botón para que la tabla ocupe toda la pantalla; la preferencia se recuerda por pestaña.
- **Tickets** muestra: ticket, clave, estatus, etapa actual, solicitante, comprador, descripción, categoría, fecha y hora de solicitud, fecha y hora de asignación, tiempo de asignación, fecha límite y de entrega de la cotización, días de cada etapa, alertas de cotización y de compra, fecha de autorización, de pago, estimada de llegada y de terminación, días fuera de plazo, vigencia y total.
- Filtros de Tickets: año, mes, comprador, solicitante, categoría, etapa, estatus, alerta de cotización, alerta de compra, rango de fechas de solicitud (desde/hasta) y búsqueda. El **Resumen** (KPIs, flujo por etapa y tiempos) se abre y cierra con un botón y recuerda la preferencia.

## Reemplazo de datos por módulo (v1.3 y v1.4)
En *Datos y bitácora* hay dos cargas que **reemplazan** lo que ya está en el portal, sin borrar nada de forma definitiva: los renglones anteriores se dan de baja (siguen en "Ver dados de baja" y en la bitácora) y se carga el archivo completo.

| Carga | Qué reemplaza | Archivo |
|---|---|---|
| **Tickets · reporte** | Solo el módulo TICKET | Reporte de tickets (hoja BASE DE DATOS); si trae la hoja de categorías también actualiza los días de cotización |
| **Sobrepedido y entregas directas · reemplazar** | Los módulos SOBREPEDIDO y ENTREGA_DIRECTA | Archivo de carga con hoja **PEDIDOS** y la columna **modulo** (`SOBREPEDIDO` / `ENTREGA_DIRECTA`) |

La hoja PEDIDOS usa los nombres de campo del portal (clave, descripcion, comprador, fecha_solicitud, fecha_estimada, fecha_real_llegada…). Los campos calculados (ALERTA, días de incumplimiento, días naturales, INV, clasificación, % pago mínimo) no se cargan: el portal los recalcula.

## Fecha estimada (al capturar o editar)
- **Días**: se toman del catálogo *Tiempos de entrega* (proveedor + solicitante) o del texto "DE 10 A 15 DIAS".
- **Entrega directa y tickets**:
  - Fecha estimada inicio = solicitud + días A.
  - Fecha estimada fin = solicitud + días B.
  - Los días son naturales o hábiles, según el catálogo.
- **Sobrepedido y pedido especial**: fecha estimada de llegada = solicitud + días B en **días hábiles** (L-V, sin días inhábiles).
- **Fecha manual**: si alguien escribe la fecha a mano queda marcada como "manual" y ya no se recalcula.

## Calendario de Entregas Directas (v1.5.1)
- **Claves del día**: las que tienen **fecha estimada de llegada ese día**, no están canceladas y aún no tienen fecha real. Cada folio se cuenta una sola vez, el día en que debe llegar.
- Antes (v1.0 a v1.5.0) la clave aparecía en **todos** los días de su ventana (fecha estimada inicio → fin), que es como lo hacía la hoja de Sheets. Eso repetía el mismo folio en muchos días e inflaba las horas: un folio con ventana de tres semanas sumaba sus horas en cada uno de esos días.
- **Horas por folio**: tiempo de descarga del folio. Las horas del día son la suma de sus folios.
- **Nivel de carga**: Sin carga (0 h) · Baja (< 4 h) · Media (4 a 7.9 h) · Alta (≥ 8 h). Los umbrales se ajustan en `config.js`.
- **KPIs del mes**: folios y horas de las claves cuya fecha estimada de llegada cae en el mes; % de entregas = claves con fecha real / claves no canceladas.
- **Atrasadas (v1.5.2)**: las claves cuya fecha estimada ya pasó y siguen sin fecha real se quedan en su día y el día se marca en rojo con "⚠ N atrasadas". El detalle del día las lista con la etiqueta ATRASADA y los días hábiles de retraso. Hay dos KPIs, *Atrasadas del mes* y *Atrasadas de meses anteriores*, y el filtro **Ver → Solo días con atrasos**. Como la captura de la fecha real no es diaria, esto sirve para perseguirlas sin sacarlas de su fecha programada.
- En el detalle del día cada renglón muestra la llegada estimada y, si el catálogo dio un rango, desde qué día se esperaba.

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
| Calendario sept-2026 con el criterio anterior (ventana): folios, proveedores y horas por día vs pantalla de Sheets | 26 de 26 días idénticos |
| KPIs del calendario: 107 folios, 237 h, 68.8% de entregas | Idénticos |
| Compradores ENTREGA DIRECTA sept-2026: 251 dentro, 0 fuera, 0 vencidas | Idéntico |

**Diferencias conocidas:**
- **Proveedores del mes en el calendario**: la app muestra 16 y la pantalla anterior 17. La app cuenta las marcas de las claves no canceladas.
- **Días naturales en BASE PRINCIPAL**: el Excel tenía valores capturados a mano (72% coincide con la fórmula). La app usa la misma fórmula para todos.

Para correr la prueba: `node tests/reglas.test.js carga_inicial.xlsx valid.json`.
