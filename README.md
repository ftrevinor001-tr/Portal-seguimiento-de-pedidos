# Portal de Seguimiento de Pedidos

Aplicación web del Área de Compras para dar seguimiento a **sobrepedidos, entregas directas, pedidos especiales y tickets**. Sustituye al Google Sheet "Entregas Directas".

- **Sobrepedido** y **Entregas directas**: una pestaña para cada módulo, con tabla, filtros, alertas y KPIs. Permiten editar una clave, editar varias a la vez, dar de baja o restaurar, y descargar a Excel. Las tablas se ven como una hoja de Excel: al bajar con el scroll se agregan los renglones siguientes (no hay botón "Siguiente").
- **Nuevo pedido**: captura por folio. El tiempo de entrega y el de descarga se toman de los catálogos. Las claves se capturan a mano o se cargan desde un CSV o Excel.
- **Tickets**: las seis etapas de cada ticket (asignación, cotización, recotización, autorización, pago y llegada) con las alertas de cotización y de compra del reporte. Las etapas 1 a 5 se miden en **horas hábiles** (8:00-13:30 y 15:00-18:00 = 8.5 h, de lunes a viernes, sin días inhábiles), así que la fecha límite de cotización tiene fecha **y hora**. Ver [`docs/reglas-de-calculo.md`](docs/reglas-de-calculo.md).
- **Calendario E. Directas**: folios, proveedores y horas de descarga por día, con nivel de carga y el detalle de cada día.
- **Compradores**: composición del cumplimiento (dentro del plazo, fuera del plazo y pendientes vencidas) por comprador.
- **Reporte mensual**: cumplimiento, clasificación de política y facturación/existencias. Se descarga a Excel.
- **Catálogos**: tiempos de entrega, tiempos de descarga, días de no recepción, días inhábiles y listas desplegables.
- **Datos y bitácora**: carga inicial, actualización del maestro de artículos, descarga de la base completa e historial de cambios.

Tecnología: HTML y JavaScript sin frameworks (GitHub Pages) + base de datos **Supabase**. No hay que compilar nada.

---

## Instalación (una sola vez)

### 1. Crear las tablas en Supabase
1. Entra a tu proyecto **Portal-seguimiento-de-pedidos** en https://supabase.com/dashboard.
2. Abre **SQL Editor → New query**.
3. Pega todo el contenido de `supabase/schema.sql` y presiona **Run**. Debe terminar con "Success".
   - El script se puede ejecutar varias veces sin borrar datos.

### 2. Poner la llave en `assets/js/config.js`
1. En Supabase ve a **Project Settings → API Keys**.
2. Copia la llave pública:
   - **anon public** (pestaña *Legacy API keys*, empieza con `eyJ…`), o
   - **publishable** (empieza con `sb_publishable_…`).
3. En GitHub abre `assets/js/config.js`, da clic en el lápiz ✏️ y reemplaza `PEGAR_AQUI_LA_LLAVE_ANON` por la llave. Guarda con **Commit changes**.

> ⚠️ **Nunca** pegues la llave `service_role` ni la `secret`: darían control total de la base a cualquiera.

### 3. Subir los archivos a GitHub
1. Abre https://github.com/ftrevinor001-tr/Portal-seguimiento-de-pedidos.
2. Da clic en **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta (`index.html`, `assets/`, `supabase/`, `docs/`, `tests/`, `README.md`, `.nojekyll`).
3. Da clic en **Commit changes**.

### 4. Publicar con GitHub Pages
1. En el repositorio ve a **Settings → Pages**.
2. En *Build and deployment* elige **Deploy from a branch**, rama **main** y carpeta **/(root)**. Da clic en **Save**.
3. En 1 o 2 minutos el portal queda en:
   **https://ftrevinor001-tr.github.io/Portal-seguimiento-de-pedidos/**

### 5. Crear el usuario de captura (contraseña)
Ver [`docs/acceso-y-contrasena.md`](docs/acceso-y-contrasena.md): se crea un usuario en **Authentication → Users** de Supabase y se ejecuta `supabase/actualizacion_1.1.0.sql`.

### 6. Carga inicial de datos
1. Abre el portal, entra con la contraseña y escribe o elige tu nombre.
2. Ve a **Datos y bitácora → Carga inicial** y sube `carga_inicial.xlsx`. Es el archivo con los datos ya limpios del Google Sheet y **no va dentro del repositorio**.
3. Deja marcadas todas las hojas y da clic en **Subir a Supabase**. Tarda menos de un minuto.
4. Revisa en **Estado de la base** que haya 7,895 pedidos y 59,320 artículos.

---

## Uso diario

| Tarea | Dónde |
|---|---|
| Registrar un pedido nuevo | Sobrepedido o Entregas directas → **＋ Nuevo pedido** |
| Marcar la llegada o la factura de varias claves | Sobrepedido o Entregas directas → selecciona las filas (o la casilla del encabezado para todo el filtro) → **Editar seleccionados** |
| Ver qué llega hoy y la carga de descarga | Calendario E. Directas |
| Actualizar existencias | Datos y bitácora → **Actualizar maestro de artículos** (exportación con IDARTICULO y EXIUNIBAS) |
| Dar de alta días festivos | Catálogos → **Días inhábiles** |
| Asignar un ticket, cotizar, autorizar, pagar o registrar la llegada | Tickets → clic en el ticket → sección **Etapas del ticket** |
| Cargar el reporte de tickets (reemplaza los tickets del portal) | Datos y bitácora → **Tickets · reporte** |
| Reemplazar sobrepedido y entregas directas con un archivo | Datos y bitácora → **Sobrepedido y entregas directas · reemplazar** |
| Cambiar los días de cotización por categoría | Catálogos → **Categorías de tickets** |
| Ver quién cambió qué | Detalle de la clave → **Historial de cambios**, o Datos y bitácora → **Bitácora** |
| Respaldo / Excel completo | Datos y bitácora → **Descargar base completa** |

- **Nada se borra físicamente.** "Dar de baja" oculta la clave, y se puede recuperar con "Ver dados de baja" → Restaurar.
- **Cada alta, cambio, baja o restauración** queda en la bitácora con el nombre de quien lo hizo.
- **Acceso (v1.1.0):** cualquiera con el link puede **ver y descargar**; para **capturar o modificar** se necesita la contraseña (botón *Entrar para editar*). Ver [`docs/acceso-y-contrasena.md`](docs/acceso-y-contrasena.md).

## Configuración (`assets/js/config.js`)

| Parámetro | Default | Qué hace |
|---|---|---|
| `CAPACIDAD_HORAS_DIA` | 8 | Horas de descarga por día que se consideran carga "Alta" en el calendario |
| `UMBRAL_CARGA_MEDIA` | 0.5 | Desde 50% de la capacidad (4 h) la carga es "Media"; por debajo es "Baja" |
| `METAS_TICKET` | 24 h / 3 / 2 / 3 / 2 / 15 | Metas de las etapas del ticket (asignación en horas; cotización, recotización, autorización, pago y llegada en días hábiles) y vigencia de la cotización |
| `USUARIO_EDICION` | `captura@portalpedidos.mx` | Correo del usuario de Supabase que se usa al entrar con contraseña |
| `DIAS_NOTIFICAR` | 5 | La ALERTA pasa a NOTIFICAR cuando faltan menos de 5 días para la fecha estimada |
| `MONTO_PAGO_PARCIAL` / `PCT_PAGO_PARCIAL` | 200,000 / 0.7 | Pago mínimo del 70% en sobrepedidos mayores a $200,000 |

Cuando cambies archivos JS o CSS, sube el número `?v=1.0.0` en `index.html` (por ejemplo a `?v=1.0.1`) para que los navegadores no usen la versión vieja guardada en caché.

## Reglas de cálculo
Ver [`docs/reglas-de-calculo.md`](docs/reglas-de-calculo.md). Incluye la validación contra el Excel original y contra las pantallas de la app anterior.

## Problemas comunes
- **"Falta configurar la conexión"**: la llave en `config.js` sigue siendo `PEGAR_AQUI…`.
- **"Las tablas no existen en Supabase"**: falta ejecutar `supabase/schema.sql`.
- **"La llave de Supabase no es válida"**: copiaste mal la llave o pegaste la de otro proyecto.
- **No se ven los cambios después de subir archivos**: espera 2 minutos, recarga con Ctrl+F5 y sube el `?v=` en `index.html`.
- **"Para guardar cambios necesitas entrar con la contraseña"**: entraste solo a consultar; usa *Entrar para editar*. Si ya entraste y sigue apareciendo, ejecuta `supabase/actualizacion_1.1.0.sql`.
- **"Contraseña incorrecta"**: revisa la contraseña del usuario en Supabase → Authentication → Users (se puede cambiar ahí mismo).
- **Supabase pausa el proyecto** tras 7 días sin uso en el plan gratuito: entra al dashboard y da clic en *Restore*.
