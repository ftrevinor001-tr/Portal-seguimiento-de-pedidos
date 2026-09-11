-- Portal de Seguimiento de Pedidos · actualización 1.0.2
-- Agrega el comprador asignado a cada clave del maestro de artículos.
-- Ejecutar en Supabase > SQL Editor > New query > Run (se puede ejecutar más de una vez).
alter table sp_articulos add column if not exists comprador text;
notify pgrst, 'reload schema';
