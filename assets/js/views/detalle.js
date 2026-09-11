/* Panel de detalle / edición de una clave, con historial de cambios */
(function () {
  const RECALC_KEYS = ['fecha_solicitud', 'dias_inicio', 'dias_fin', 'tipo_dias'];

  function resumen(p) {
    const chip = (l, v) => `<div class="chip"><span>${U.esc(l)}</span><b>${v === '' || v === null || v === undefined ? '—' : v}</b></div>`;
    return `<div class="chips">
      ${chip('Días naturales', U.esc(p._dias_naturales ?? ''))}
      ${chip('Días incumplimiento', U.esc(p._incumplimiento))}
      ${chip('Días reales entrega', U.esc(p._dias_entrega ?? ''))}
      ${chip('Existencia', U.fmtNumAuto(p.existencia))}
      ${chip('INV', U.esc(p._inv))}
      ${chip('Facturación', U.esc(p._estatus_fact))}
      ${chip('Clasificación', U.esc(p._clasificacion))}
      ${p.modulo === 'SOBREPEDIDO' ? chip('% pago mínimo', U.fmtPct(p._pct_minimo, 0)) + chip('Cumple política', U.esc(p._cumple_politica)) : ''}
    </div>`;
  }

  APP.abrirDetalle = function (id) {
    const p = S.byId(id);
    if (!p) { UI.toast('Registro no encontrado', 'error'); return; }
    const fields = S.fieldsFor(p.modulo);
    const secs = U.groupBy(fields, (f) => f.sec);
    const head = `<div class="dh-top">${UI.alerta(p._alerta)} <span class="mod mod-${p.modulo}">${U.esc(p.tipo_solicitud || C.MODULO_LABEL[p.modulo])}</span> ${p.activo === false ? '<span class="badge badge-muted">DADO DE BAJA</span>' : ''}</div>
      <h2>${U.esc(p.folio_pedido || 'Sin folio')} · Clave ${U.esc(p.clave || '—')}</h2><p class="dh-desc">${U.esc(p.descripcion || '')}</p>
      <div class="tabs-mini"><button class="on" data-t="datos">Datos</button><button data-t="hist">Historial de cambios</button><button data-t="folio">Claves del folio</button></div>`;
    const body = U.h(`<div>
      <div data-pane="datos">${resumen(p)}
        <form class="det-form" autocomplete="off">${[...secs.entries()].map(([sec, fs]) => `<fieldset><legend>${U.esc(sec)}</legend><div class="grid-fields">${fs.map((f) => UI.field(f, p[f.k], { modulo: p.modulo })).join('')}</div></fieldset>`).join('')}
        ${UI.datalists(['SOLICITANTE', 'MARCA', 'UNIDAD', 'PROVEEDOR', 'TIPO_MATERIAL'], p.modulo)}</form>
        <p class="muted small">Creado por ${U.esc(p.creado_por || '—')} · Última modificación ${U.fmtDateTime(p.actualizado_en)} por ${U.esc(p.actualizado_por || '—')}${p.origen_hoja ? ` · Origen: ${U.esc(p.origen_hoja)} fila ${p.origen_fila}` : ''}</p>
      </div>
      <div data-pane="hist" hidden><div class="hist">Cargando…</div></div>
      <div data-pane="folio" hidden></div>
    </div>`);
    const footer = U.h(`<div class="det-foot">
      ${p.activo === false ? '<button class="btn btn-ghost" data-a="restore">Restaurar</button>' : '<button class="btn btn-danger-ghost" data-a="baja">Dar de baja</button>'}
      <span class="spacer"></span><span class="dirty" hidden>Cambios sin guardar</span>
      <button class="btn btn-ghost" data-a="close">Cerrar</button><button class="btn btn-primary" data-a="save">Guardar</button></div>`);
    const d = UI.drawer({ title: head, body, footer });
    const form = U.$('.det-form', d.el);
    const keys = fields.map((f) => f.k);

    const valores = () => UI.readFields(form, keys);
    const cambios = () => {
      const now = valores(); const out = {};
      for (const k of keys) {
        const a = S.coerce(k, p[k]); const b = now[k];
        if (String(a ?? '') !== String(b ?? '')) out[k] = b;
      }
      return out;
    };
    const markDirty = () => { U.$('.dirty', d.el).hidden = !Object.keys(cambios()).length; };

    // Recalcular fecha estimada si no es manual
    form.addEventListener('change', (e) => {
      const k = e.target.name;
      if (k === 'fecha_estimada' || k === 'fecha_estimada_inicio') { const man = form.querySelector('[name="fecha_estimada_manual"]'); if (man) man.checked = true; }
      if (k === 'tiempo_entrega') {
        const t = C.parseTiempoEntrega(e.target.value);
        if (t.ini !== null) { form.querySelector('[name="dias_inicio"]').value = t.ini; form.querySelector('[name="dias_fin"]').value = t.fin; if (t.tipo) form.querySelector('[name="tipo_dias"]').value = t.tipo; }
      }
      if (RECALC_KEYS.includes(k) || k === 'tiempo_entrega' || k === 'fecha_estimada_manual') {
        const v = valores();
        if (!v.fecha_estimada_manual) {
          const fe = C.fechasEstimadas({ ...p, ...v }, S.hol);
          if (fe.fin) form.querySelector('[name="fecha_estimada"]').value = fe.fin;
          const ini = form.querySelector('[name="fecha_estimada_inicio"]'); if (ini && fe.inicio) ini.value = fe.inicio;
        }
      }
      if (k === 'fecha_real_llegada' && e.target.value) {
        const s = form.querySelector('[name="status_pedido"]');
        if (s && U.norm(s.value) === 'PENDIENTE') { s.value = p.modulo === 'SOBREPEDIDO' ? 'FINALIZADO' : 'ENTREGADO'; UI.toast(`Status cambiado a ${s.value} (recuerda guardar)`, 'warn'); }
      }
      markDirty();
    });
    form.addEventListener('input', markDirty);

    // Pestañas
    U.$$('.tabs-mini button', d.el).forEach((b) => b.onclick = async () => {
      U.$$('.tabs-mini button', d.el).forEach((x) => x.classList.toggle('on', x === b));
      U.$$('[data-pane]', d.el).forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.t; });
      if (b.dataset.t === 'hist') {
        const box = U.$('.hist', d.el);
        try {
          const rows = await S.bitacoraDe(p.id);
          box.innerHTML = rows.length ? `<table class="grid compact"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="nowrap">${U.fmtDateTime(r.fecha)}</td><td>${U.esc(r.usuario || '')}</td><td>${U.esc(r.accion)}</td><td>${U.esc(S.FIELD[r.campo] ? S.FIELD[r.campo].label : r.campo || '')}</td><td>${U.esc(r.valor_anterior ?? '')}</td><td>${U.esc(r.valor_nuevo ?? '')}</td></tr>`).join('')}</tbody></table>` : UI.empty('Sin cambios registrados');
        } catch (e) { box.innerHTML = `<p class="error">${U.esc(e.message)}</p>`; }
      }
      if (b.dataset.t === 'folio') {
        const pane = U.$('[data-pane="folio"]', d.el);
        const same = p.folio_pedido ? S.pedidos.filter((x) => x.folio_pedido === p.folio_pedido) : [p];
        pane.innerHTML = `<p class="muted">${same.length} clave(s) con el folio <b>${U.esc(p.folio_pedido || '')}</b>. Para cambiar varias a la vez, selecciónalas en la tabla y usa “Editar seleccionados”.</p>
          <table class="grid compact"><thead><tr><th>Clave</th><th>Descripción</th><th>Cant.</th><th>F. estimada</th><th>F. real</th><th>Alerta</th></tr></thead><tbody>${same.map((x) => `<tr class="clickable" data-id="${x.id}"><td>${U.esc(x.clave)}</td><td>${U.esc(x.descripcion)}</td><td class="num">${U.fmtNumAuto(x.cantidad_solicitada)}</td><td>${U.fmtDate(x.fecha_estimada)}</td><td>${U.fmtDate(x.fecha_real_llegada)}</td><td>${UI.alerta(x._alerta)}</td></tr>`).join('')}</tbody></table>`;
        U.$$('tr[data-id]', pane).forEach((tr) => tr.onclick = () => { d.close(); APP.abrirDetalle(+tr.dataset.id); });
      }
    });

    U.$('[data-a="close"]', d.el).onclick = async () => { if (Object.keys(cambios()).length && !(await UI.confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?'))) return; d.close(); };
    U.$('[data-a="save"]', d.el).onclick = async () => {
      const ch = cambios();
      if (!Object.keys(ch).length) { UI.toast('No hay cambios', 'warn'); return; }
      if (!S.user) { APP.pickUser(true); return; }
      const btn = U.$('[data-a="save"]', d.el); btn.disabled = true; btn.textContent = 'Guardando…';
      try { await S.updatePedido(p.id, ch); UI.toast(`Guardado (${Object.keys(ch).length} campo(s))`); d.close(); APP.abrirDetalle(p.id); }
      catch (e) { UI.toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar'; }
    };
    const baja = U.$('[data-a="baja"]', d.el), rest = U.$('[data-a="restore"]', d.el);
    if (baja) baja.onclick = async () => {
      if (!S.user) { APP.pickUser(true); return; }
      if (!(await UI.confirm('La clave se ocultará de los tableros. Queda en la bitácora y se puede restaurar desde “Ver dados de baja”. ¿Continuar?', { ok: 'Dar de baja', danger: true }))) return;
      try { await S.updatePedido(p.id, { activo: false }); UI.toast('Clave dada de baja'); d.close(); } catch (e) { UI.toast(e.message, 'error'); }
    };
    if (rest) rest.onclick = async () => {
      if (!S.user) { APP.pickUser(true); return; }
      try { await S.updatePedido(p.id, { activo: true }); UI.toast('Clave restaurada'); d.close(); } catch (e) { UI.toast(e.message, 'error'); }
    };
  };
})();
