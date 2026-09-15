-- Portal de Seguimiento de Pedidos · actualización 1.1.0
-- Contraseña para capturar y editar: cualquiera con el link puede VER,
-- pero solo quien inicia sesión (usuario creado en Supabase → Authentication) puede escribir.
-- Ejecutar en Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- (v1.1.0 — antes anon también podía escribir)
do $$
declare t text;
begin
  foreach t in array array['sp_pedidos','sp_cat_tiempo_entrega','sp_cat_tiempo_descarga','sp_cat_dias_no_recepcion','sp_cat_dias_inhabiles','sp_cat_listas','sp_articulos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_sel', t);
    execute format('drop policy if exists %I on %I', t||'_ins', t);
    execute format('drop policy if exists %I on %I', t||'_upd', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)', t||'_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t||'_ins', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t||'_upd', t);
  end loop;
end $$;

-- Bitácora y cargas: todos leen; solo quien inició sesión da de alta (nadie edita ni borra el historial)
alter table sp_bitacora enable row level security;
drop policy if exists sp_bitacora_sel on sp_bitacora;
create policy sp_bitacora_sel on sp_bitacora for select to anon, authenticated using (true);

alter table sp_cargas enable row level security;
drop policy if exists sp_cargas_sel on sp_cargas;
drop policy if exists sp_cargas_ins on sp_cargas;
create policy sp_cargas_sel on sp_cargas for select to anon, authenticated using (true);
create policy sp_cargas_ins on sp_cargas for insert to authenticated with check (true);

-- El maestro de artículos se reemplaza completo al subir el Excel: se permite borrar solo esa tabla y solo con sesión
drop policy if exists sp_articulos_del on sp_articulos;
create policy sp_articulos_del on sp_articulos for delete to authenticated using (true);

-- Permisos de tabla explícitos
grant usage on schema public to anon, authenticated;
grant select on sp_pedidos, sp_cat_tiempo_entrega, sp_cat_tiempo_descarga,
  sp_cat_dias_no_recepcion, sp_cat_dias_inhabiles, sp_cat_listas, sp_articulos,
  sp_bitacora, sp_v_pedidos, sp_cargas to anon, authenticated;
grant insert, update on sp_pedidos, sp_cat_tiempo_entrega, sp_cat_tiempo_descarga,
  sp_cat_dias_no_recepcion, sp_cat_dias_inhabiles, sp_cat_listas to authenticated;
grant insert, update, delete on sp_articulos to authenticated;
grant insert on sp_cargas to authenticated;
revoke insert, update, delete on sp_pedidos, sp_cat_tiempo_entrega, sp_cat_tiempo_descarga,
  sp_cat_dias_no_recepcion, sp_cat_dias_inhabiles, sp_cat_listas, sp_articulos, sp_bitacora, sp_cargas from anon;

notify pgrst, 'reload schema';
