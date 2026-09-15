# Acceso al portal: consultar sin contraseña, capturar con contraseña (v1.1.0)

## Cómo queda
| Quién | Puede |
|---|---|
| Cualquiera con el link | Ver seguimiento, calendario, compradores, reporte mensual, catálogos y bitácora. Descargar la base y los reportes a Excel. |
| Quien tenga la contraseña | Todo lo anterior **más** capturar pedidos, editar claves, editar varias a la vez, dar de baja o restaurar, cambiar catálogos y subir archivos. |

El bloqueo no es solo de pantalla: los permisos están en la base de datos (RLS de Supabase). Sin haber entrado con la contraseña, Supabase **rechaza** cualquier intento de escribir, aunque alguien conozca la llave pública del portal.

## Instalación (una sola vez)

### 1. Crear el usuario de captura en Supabase
1. Entra a tu proyecto en https://supabase.com/dashboard.
2. Ve a **Authentication → Users → Add user → Create new user**.
3. Captura:
   - **Email**: `captura@portalpedidos.mx`
   - **Password**: la contraseña que va a usar el equipo (guárdala; se puede cambiar cuando quieras).
   - Marca **Auto Confirm User** (así no se manda ningún correo).
4. Da clic en **Create user**.

> Si prefieres otro correo, ponlo en `assets/js/config.js` como
> `USUARIO_EDICION: 'elcorreoquequieras@dominio.com',`

### 2. Ejecutar el SQL de permisos
1. En Supabase ve a **SQL Editor → New query**.
2. Pega el contenido de `supabase/actualizacion_1.1.0.sql` y da clic en **Run**.
3. Se puede ejecutar más de una vez sin problema.

### 3. Subir los archivos de la versión 1.1.0 a GitHub
Y recargar el portal con **Ctrl + F5**.

## Uso diario
- Al abrir el portal aparece **🔒 Solo lectura** en la esquina superior derecha.
- Botón **Entrar para editar** → escribe la contraseña y tu nombre (el nombre queda en la bitácora de cada cambio).
- La sesión se guarda en ese navegador y se renueva sola; con **Salir** se regresa a solo lectura.
- Cada quien entra en su propia computadora o celular con la misma contraseña.

## Cambiar la contraseña
Supabase → **Authentication → Users** → el usuario `captura@portalpedidos.mx` → **Reset password / Update user**. Cambia de inmediato para todos; quienes ya estaban dentro siguen su sesión hasta que salgan o pase una hora.

## Si más adelante quieres una contraseña por persona
Se dan de alta más usuarios en **Authentication → Users** y en el portal se pide correo + contraseña en lugar de solo la contraseña. La bitácora ya guarda el nombre de quien captura.

## Preguntas frecuentes
- **¿Se puede ver sin contraseña?** Sí, esa fue la decisión: consultar y descargar es libre, capturar y modificar no.
- **¿Qué pasa si alguien copia la llave del portal?** Solo le sirve para leer. Las políticas de la base solo permiten escribir a quien inició sesión.
- **¿Y la bitácora?** Sigue igual: cada alta, cambio, baja o restauración queda con el nombre que capturó y la fecha.
