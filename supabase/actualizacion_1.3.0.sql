-- Portal de Seguimiento de Pedidos · actualización 1.3.0
-- Tickets según el "REPORTE DE TICKETS 2026": asignación con hora, fecha límite de cotización
-- por categoría, autorización de compra, pago a proveedor y llegada.
-- Ejecutar en Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.

-- 1) Campos nuevos del reporte
alter table sp_pedidos add column if not exists categoria_ticket text;
alter table sp_pedidos add column if not exists fecha_limite_cotizacion date;
alter table sp_pedidos add column if not exists fecha_autorizacion_compra date;
alter table sp_pedidos add column if not exists fecha_pago_proveedor date;
alter table sp_pedidos add column if not exists asignado_por text;
-- La asignación ahora guarda también la hora (la vista se quita antes porque depende de la columna)
drop view if exists sp_v_pedidos;
alter table sp_pedidos alter column fecha_asignacion type timestamp using fecha_asignacion::timestamp;

-- 2) Catálogo de categorías de cotización (días hábiles para entregar la cotización al usuario)
create table if not exists sp_cat_categorias_ticket (
  id               bigint generated always as identity primary key,
  categoria        text not null unique,
  dias             int  not null default 3,
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
drop trigger if exists sp_cat_categorias_ticket_log on sp_cat_categorias_ticket;
create trigger sp_cat_categorias_ticket_log before update on sp_cat_categorias_ticket for each row execute function sp_log_cambios();

insert into sp_cat_categorias_ticket (categoria, dias) values
  ('REDES Y CABLEADO', 4),
  ('EQUIPO DE CÓMPUTO/TI', 4),
  ('CÁMARAS Y SEGURIDAD (CCTV/ALARMAS)', 3),
  ('INSUMOS PARA TIENDA (EMPAQUE/ETIQUETAS/PROMOCIONALES)', 5),
  ('REFACCIONES/REPARACIÓN MAQUINARIA', 5),
  ('MANTENIMIENTO ELÉCTRICO/INSTALACIONES', 3),
  ('MERCADOTECNIA/PUBLICIDAD', 4),
  ('MATERIAL CONSTRUCCIÓN/PLOMERÍA/HERRERÍA', 3),
  ('UNIFORMES/EPP Y PROTECCIÓN CIVIL', 3),
  ('ALIMENTOS Y BEBIDAS (EVENTOS)', 3),
  ('EQUIPO DE PUNTO DE VENTA (POS)', 4),
  ('HERRAMIENTAS Y MAQUINARIA INDUSTRIAL', 5),
  ('MOBILIARIO Y EQUIPO DE SUCURSAL/ALMACÉN', 4),
  ('ELECTRODOMÉSTICOS', 3),
  ('VEHÍCULOS (COMPRA/COTIZACIÓN)', 3),
  ('PAPELERÍA/CONSUMIBLES OFICINA', 4),
  ('LICENCIAS Y SOFTWARE', 3),
  ('TELEFONÍA/AUDIO', 3),
  ('LIMPIEZA E HIGIENE', 3),
  ('TRÁMITES ADMINISTRATIVOS', 3),
  ('LETREROS/SEÑALÉTICA', 3),
  ('OTROS / DIVERSOS (CASO ÚNICO, VER DETALLE)', 7),
  ('EVENTOS INTERNOS / RH (CUMPLEAÑOS, KITS ESCOLARES, RECREATIVO)', 3),
  ('SOLICITUDES SIN DETALLE ESPECÍFICO / REFERIDAS A ANEXO', 4),
  ('INSUMOS MÉDICOS/LABORATORIO', 4),
  ('MASCOTAS/ANIMALES', 3),
  ('JARDINERÍA', 3),
  ('COTIZACIONES/EVALUACIÓN DE PROVEEDORES (ADMINISTRATIVO)', 3)
on conflict (categoria) do update set dias = excluded.dias;

-- 3) Permisos de la tabla nueva (igual que los demás catálogos)
alter table sp_cat_categorias_ticket enable row level security;
drop policy if exists sp_cat_categorias_ticket_sel on sp_cat_categorias_ticket;
drop policy if exists sp_cat_categorias_ticket_ins on sp_cat_categorias_ticket;
drop policy if exists sp_cat_categorias_ticket_upd on sp_cat_categorias_ticket;
create policy sp_cat_categorias_ticket_sel on sp_cat_categorias_ticket for select to anon, authenticated using (true);
create policy sp_cat_categorias_ticket_ins on sp_cat_categorias_ticket for insert to authenticated with check (true);
create policy sp_cat_categorias_ticket_upd on sp_cat_categorias_ticket for update to authenticated using (true) with check (true);
grant select on sp_cat_categorias_ticket to anon, authenticated;
grant insert, update on sp_cat_categorias_ticket to authenticated;
revoke insert, update, delete on sp_cat_categorias_ticket from anon;

-- 4) La vista se recrea para que incluya las columnas nuevas
drop view if exists sp_v_pedidos;
create view sp_v_pedidos with (security_invoker = on) as
  select p.*, a.existencia as existencia, a.descripcion as art_descripcion
  from sp_pedidos p
  left join sp_articulos a on a.clave = p.clave;
grant select on sp_v_pedidos to anon, authenticated;

notify pgrst, 'reload schema';
