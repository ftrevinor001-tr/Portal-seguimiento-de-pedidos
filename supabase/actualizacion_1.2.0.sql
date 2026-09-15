-- Portal de Seguimiento de Pedidos · actualización 1.2.0
-- Etapas del ticket: asignación, cotización, recotización y entrega.
-- Ejecutar en Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.

-- Etapas del ticket (v1.2.0) en bases que ya existían
alter table sp_pedidos add column if not exists fecha_asignacion date;
alter table sp_pedidos add column if not exists asignado_por text;
alter table sp_pedidos add column if not exists fecha_cotizacion_usuario date;
alter table sp_pedidos add column if not exists vigencia_dias int;
alter table sp_pedidos add column if not exists fecha_vence_cotizacion date;
alter table sp_pedidos add column if not exists fecha_recotizacion_usuario date;
alter table sp_pedidos add column if not exists vigencia_dias_2 int;
alter table sp_pedidos add column if not exists fecha_vence_cotizacion_2 date;
alter table sp_pedidos add column if not exists fecha_aceptacion_usuario date;
alter table sp_pedidos add column if not exists nota_etapas text;
create index if not exists sp_pedidos_folio_mod_idx on sp_pedidos (modulo, folio_pedido);

-- La vista se recrea para que incluya las columnas nuevas (select p.* se expande al crearla)
drop view if exists sp_v_pedidos;
create view sp_v_pedidos with (security_invoker = on) as
  select p.*, a.existencia as existencia, a.descripcion as art_descripcion
  from sp_pedidos p
  left join sp_articulos a on a.clave = p.clave;
grant select on sp_v_pedidos to anon, authenticated;

notify pgrst, 'reload schema';
