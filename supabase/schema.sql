-- =====================================================================
-- Portal de Seguimiento: Sobrepedido · Entregas Directas · Pedido Especial · Tickets
-- Esquema Supabase (PostgreSQL). Ejecutar completo en: Supabase > SQL Editor > New query
-- Todas las tablas usan prefijo sp_ para no chocar con otras tablas del proyecto.
-- Acceso: cualquiera con el link puede ver, crear y editar. No se permite DELETE:
-- los registros se "eliminan" con activo=false y pueden restaurarse.
-- Cada alta/cambio queda en sp_bitacora (trigger), con el usuario que eligió su nombre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PEDIDOS  (una sola tabla para los 3 módulos)
--    modulo: 'SOBREPEDIDO' | 'ENTREGA_DIRECTA' | 'TICKET'
--    Los campos calculados (alerta, días de incumplimiento, días naturales,
--    INV, estatus de facturación calculado, clasificación, % pago mínimo,
--    cumple política) NO se guardan: la app los calcula al vuelo con la fecha de hoy.
-- ---------------------------------------------------------------------
create table if not exists sp_pedidos (
  id                          bigint generated always as identity primary key,
  modulo                      text not null check (modulo in ('SOBREPEDIDO','ENTREGA_DIRECTA','TICKET')),

  -- Identificación
  anio                        int,
  mes                         text,
  tipo_solicitud              text,          -- SOBREPEDIDO, ESPECIAL, PEDIDO ESPECIAL, SUCURSAL ENTREGA DIRECTA, ENTREGA DIRECTA, TICKET
  catalogado_nuevo            text,          -- CATALOGADO | NUEVO
  clave                       text,
  descripcion                 text,
  marca                       text,
  comprador                   text,
  unidad                      text,
  id_oc                       text,          -- columna "ID" (orden de compra)
  alerta_id_oc                text,          -- "ALERTA ID (OC)" (Entregas directas / Tickets)
  folio_pedido                text,
  status_pedido               text,          -- PENDIENTE | FINALIZADO | ENTREGADO | CANCELADO
  area                        text,
  solicitante                 text,          -- sucursal o persona que solicita
  proveedor                   text,          -- nuevo: permite calcular tiempo de entrega con el catálogo
  tipo_material               text,          -- nuevo: permite calcular tiempo de descarga con el catálogo

  -- Tiempos y fechas
  fecha_solicitud             timestamp,
  cantidad_solicitada         numeric,
  tiempo_descarga_horas       numeric,
  tiempo_entrega              text,          -- texto original, ej. "DE 10 A 15 DIAS"
  dias_inicio                 int,           -- extraído del texto
  dias_fin                    int,
  tipo_dias                   text check (tipo_dias in ('NATURALES','HABILES') or tipo_dias is null),
  fecha_estimada_inicio       date,
  fecha_estimada              date,          -- SOBREPEDIDO: "FECHA ESTIMADA DE LLEGADA"; E.D./TICKET: "FECHA ESTIMADA FIN"
  fecha_estimada_manual       boolean not null default false,  -- true = el usuario sobrescribió la fecha calculada
  te_especial_comprador       date,          -- "TE ESPECIAL - SOLICITADO POR COMPRADOR"
  fecha_real_llegada          date,
  fecha_compromiso            date,
  fecha_compromiso_nota       text,          -- cuando venía como texto libre ("6-10/04/2026", "04 DE FEBRERO")
  resultado_final             text,
  directo_sanver              text,          -- DG | SUCURSAL
  tipo_directo                text,

  -- Facturación / entregas parciales
  folio_factura               text,
  fecha_facturacion           date,
  estatus_facturacion         text,          -- capturado: TERMINADO | PENDIENTE | CANCELADO
  fecha_facturacion_1         date,          -- "FECHA FACTURACION" (1ra entrega)
  cantidad_entregada          numeric,
  fecha_facturacion_2         date,          -- "FECHA FACTURACION 2da ENTREGA"
  cantidad_entregada_2        numeric,
  validacion_telemarketing    text,

  -- Política de documentación (Sobrepedido)
  validacion_clasificacion    text,          -- SOBREPEDIDO - VENTA REAL | SOBREPEDIDO - USO INTERNO | PEDIDO ESPECIAL - DESARROLLADOR | PEDIDO ESPECIAL - GERENCIA DE VENTAS
  cuenta_cotizacion           text,          -- SI | NO
  pct_pagado                  numeric,       -- 0 a 1
  factura_emitida_cliente     text,          -- SI | NO
  costo_unitario              numeric,
  costo_total                 numeric,

  comentarios                 text,
  observaciones               text,

  -- Control
  activo                      boolean not null default true,
  origen_hoja                 text,          -- trazabilidad de la carga inicial
  origen_fila                 int,
  creado_en                   timestamptz not null default now(),
  creado_por                  text,
  actualizado_en              timestamptz not null default now(),
  actualizado_por             text
);

create index if not exists sp_pedidos_modulo_idx      on sp_pedidos (modulo, activo);
create index if not exists sp_pedidos_clave_idx       on sp_pedidos (clave);
create index if not exists sp_pedidos_folio_idx       on sp_pedidos (folio_pedido);
create index if not exists sp_pedidos_comprador_idx   on sp_pedidos (comprador);
create index if not exists sp_pedidos_fsol_idx        on sp_pedidos (fecha_solicitud);

-- Por si la tabla ya existía de una versión anterior del script
alter table sp_pedidos add column if not exists tipo_material text;

-- ---------------------------------------------------------------------
-- 2) BITÁCORA de cambios (se llena sola con trigger)
-- ---------------------------------------------------------------------
create table if not exists sp_bitacora (
  id              bigint generated always as identity primary key,
  tabla           text not null,
  registro_id     bigint,
  accion          text not null,        -- ALTA | CAMBIO | BAJA | RESTAURAR
  campo           text,
  valor_anterior  text,
  valor_nuevo     text,
  usuario         text,
  fecha           timestamptz not null default now()
);
create index if not exists sp_bitacora_reg_idx on sp_bitacora (tabla, registro_id, fecha desc);
create index if not exists sp_bitacora_fecha_idx on sp_bitacora (fecha desc);

create or replace function sp_log_cambios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text; v_old text; v_new text; usr text; acc text;
  ignorar text[] := array['actualizado_en','actualizado_por','creado_en','creado_por'];
begin
  if tg_op = 'INSERT' then
    insert into sp_bitacora(tabla, registro_id, accion, usuario)
    values (tg_table_name, new.id, 'ALTA', new.creado_por);
    return new;
  end if;

  new.actualizado_en := now();
  usr := coalesce(new.actualizado_por, 'SIN NOMBRE');

  if tg_table_name = 'sp_pedidos' and old.activo is distinct from new.activo then
    acc := case when new.activo then 'RESTAURAR' else 'BAJA' end;
    insert into sp_bitacora(tabla, registro_id, accion, usuario) values (tg_table_name, new.id, acc, usr);
  end if;

  for k in select jsonb_object_keys(to_jsonb(new)) loop
    continue when k = any(ignorar) or k = 'activo';
    v_old := to_jsonb(old) ->> k;
    v_new := to_jsonb(new) ->> k;
    if v_old is distinct from v_new then
      insert into sp_bitacora(tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario)
      values (tg_table_name, new.id, 'CAMBIO', k, v_old, v_new, usr);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists sp_pedidos_log on sp_pedidos;
create trigger sp_pedidos_log before insert or update on sp_pedidos
  for each row execute function sp_log_cambios();

-- ---------------------------------------------------------------------
-- 3) CATÁLOGOS
-- ---------------------------------------------------------------------
create table if not exists sp_cat_tiempo_entrega (
  id               bigint generated always as identity primary key,
  proveedor        text not null,
  solicitante      text not null,
  entrega_directa  text,          -- SI | NO
  tiempo_entrega   text,
  dias_inicio      int,
  dias_fin         int,
  tipo_dias        text,          -- NATURALES | HABILES
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);

create table if not exists sp_cat_tiempo_descarga (
  id               bigint generated always as identity primary key,
  proveedor        text not null,
  marca            text,
  tipo_material    text,
  horas            numeric,
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);

create table if not exists sp_cat_dias_no_recepcion (
  id               bigint generated always as identity primary key,
  solicitante      text not null,
  dia              text not null,  -- LUNES..DOMINGO
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);

create table if not exists sp_cat_dias_inhabiles (
  id               bigint generated always as identity primary key,
  fecha            date not null unique,
  descripcion      text,
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);

-- Listas desplegables: COMPRADOR, AREA, SOLICITANTE, TIPO_SOLICITUD, UNIDAD, MARCA, USUARIO
create table if not exists sp_cat_listas (
  id               bigint generated always as identity primary key,
  lista            text not null,
  valor            text not null,
  modulo           text,           -- null = aplica a todos
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (lista, valor, modulo)
);

do $$
declare t text;
begin
  foreach t in array array['sp_cat_tiempo_entrega','sp_cat_tiempo_descarga','sp_cat_dias_no_recepcion','sp_cat_dias_inhabiles','sp_cat_listas'] loop
    execute format('drop trigger if exists %I_log on %I', t, t);
    execute format('create trigger %I_log before update on %I for each row execute function sp_log_cambios()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) ARTÍCULOS (maestro "E": se reemplaza subiendo el Excel desde la app)
-- ---------------------------------------------------------------------
create table if not exists sp_articulos (
  clave            text primary key,
  descripcion      text,
  marca            text,
  grupo            text,
  estatus_vta      text,
  estatus_compra   text,
  unidad           text,
  existencia       numeric,        -- EXIUNIBAS
  costo            numeric,        -- COSTOUC_BM
  comprador        text,           -- comprador asignado a la clave (si hay varios: "A | B")
  actualizado_en   timestamptz not null default now()
);

-- Por si la tabla ya existía de una versión anterior (v1.0.2)
alter table sp_articulos add column if not exists comprador text;

create table if not exists sp_cargas (
  id               bigint generated always as identity primary key,
  tipo             text not null,  -- ARTICULOS | CARGA_INICIAL
  archivo          text,
  registros        int,
  usuario          text,
  fecha            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4b) VISTA que la app consulta: pedidos + existencia vigente del maestro
-- ---------------------------------------------------------------------
drop view if exists sp_v_pedidos;
create view sp_v_pedidos with (security_invoker = on) as
  select p.*, a.existencia as existencia, a.descripcion as art_descripcion
  from sp_pedidos p
  left join sp_articulos a on a.clave = p.clave;

-- ---------------------------------------------------------------------
-- 5) SEGURIDAD (RLS): ver / crear / editar sin login; sin DELETE
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sp_pedidos','sp_cat_tiempo_entrega','sp_cat_tiempo_descarga','sp_cat_dias_no_recepcion','sp_cat_dias_inhabiles','sp_cat_listas','sp_articulos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_sel', t);
    execute format('drop policy if exists %I on %I', t||'_ins', t);
    execute format('drop policy if exists %I on %I', t||'_upd', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)', t||'_sel', t);
    execute format('create policy %I on %I for insert to anon, authenticated with check (true)', t||'_ins', t);
    execute format('create policy %I on %I for update to anon, authenticated using (true) with check (true)', t||'_upd', t);
  end loop;
end $$;

-- Bitácora y cargas: solo lectura + alta (nadie puede editar ni borrar el historial)
alter table sp_bitacora enable row level security;
drop policy if exists sp_bitacora_sel on sp_bitacora;
create policy sp_bitacora_sel on sp_bitacora for select to anon, authenticated using (true);

alter table sp_cargas enable row level security;
drop policy if exists sp_cargas_sel on sp_cargas;
drop policy if exists sp_cargas_ins on sp_cargas;
create policy sp_cargas_sel on sp_cargas for select to anon, authenticated using (true);
create policy sp_cargas_ins on sp_cargas for insert to anon, authenticated with check (true);

-- El maestro de artículos se reemplaza completo al subir el Excel: se permite borrar solo esa tabla
drop policy if exists sp_articulos_del on sp_articulos;
create policy sp_articulos_del on sp_articulos for delete to anon, authenticated using (true);

-- Permisos de tabla explícitos
grant select, insert, update on sp_pedidos, sp_cat_tiempo_entrega, sp_cat_tiempo_descarga,
  sp_cat_dias_no_recepcion, sp_cat_dias_inhabiles, sp_cat_listas to anon, authenticated;
grant select, insert, update, delete on sp_articulos to anon, authenticated;
grant select on sp_bitacora to anon, authenticated;
grant select on sp_v_pedidos to anon, authenticated;
grant select, insert on sp_cargas to anon, authenticated;
grant usage on schema public to anon, authenticated;
revoke delete on sp_pedidos, sp_cat_tiempo_entrega, sp_cat_tiempo_descarga,
  sp_cat_dias_no_recepcion, sp_cat_dias_inhabiles, sp_cat_listas, sp_bitacora, sp_cargas from anon, authenticated;
