/* Panel de detalle / edición de una clave, con historial de cambios */
(function () {
  const RECALC_KEYS = ['fecha_solicitud', 'dias_inicio', 'dias_fin', 'tipo_dias'];

  /** Línea de tiempo de las 4 etapas del ticket */
  function etapasHTML(p) {
    const t = p._etapas || C.etapasTicket(p, S.hoy, S.hol, S.cat.cats);
    const clase = (e) => e.estado === 'HECHA' ? (e.cumple ? 'et-ok' : 'et-mal') : e.estado === 'EN CURSO' ? (e.cumple ? 'et-curso' : 'et-tarde') : e.estado === 'INACTIVA' ? 'et-off' : 'et-pend';
    const dias = (e) => e.dias === null ? '—' : e.unidad === 'h' ? `${C.textoHoras(e.dias)} h` : `${e.dias} d`;
    const vig = t.vigente && t.venceEn !== null
      ? (t.venceEn < 0 ? `<span class="warn-box">La cotización venció el ${U.fmtDate(t.vigente)} (hace ${-t.venceEn} días) sin autorización de compra: hay que recotizar.</span>`
        : `<div class="muted small">Cotización vigente hasta el ${U.fmtDate(t.vigente)} (${t.venceEn} día(s)).</div>`)
      : '';
    const cls = (a) => a === 'FUERA DEL PLAZO' ? 'critical' : ['POR VENCER', 'VENCE HOY'].includes(a) ? 'warning' : ['FINALIZADO', 'EN TIEMPO'].includes(a) ? 'ok' : 'muted';
    const alertas = `<div class="etapas-alertas">
      <span class="badge badge-${cls(t.alertaCotizacion)}">Cotización: ${U.esc(t.alertaCotizacion)}</span>
      <span class="badge badge-${cls(t.alertaCompra)}">Compra: ${U.esc(t.alertaCompra)}</span>
      ${t.origenLimite === 'CATEGORIA' ? `<span class="muted small">Límite de cotización: <b>${U.fmtDateTime(t.limite)}</b> (${U.esc(p.categoria_ticket)}: ${t.categoriaDias} día(s) = ${C.textoHoras(t.horasCotizacion)} h hábiles)</span>`
        : t.origenLimite === 'MANUAL' ? `<span class="muted small">Límite de cotización: <b>${U.fmtDateTime(t.limite)}</b> (fecha capturada; elige la categoría para calcularlo por horas)</span>`
        : '<span class="badge badge-warning">Sin categoría: elige la categoría del ticket para calcular el tiempo de cotización</span>'}
      ${t.restanteCotizacion === null || t.restanteCotizacion === undefined ? '' : t.restanteCotizacion < 0
        ? `<span class="badge badge-critical">Vencida hace ${C.textoHoras(-t.restanteCotizacion)} h hábiles</span>`
        : `<span class="badge badge-${t.restanteCotizacion <= C.horasDia() ? 'warning' : 'ok'}">Faltan ${C.textoHoras(t.restanteCotizacion)} h hábiles</span>`}
      ${t.diasFuera ? `<span class="badge badge-critical">${t.diasFuera} día(s) fuera de plazo</span>` : ''}
      ${t.validacion !== 'OK' ? `<span class="muted small">${U.esc(t.validacion)}</span>` : ''}
    </div>`;
    return `<div class="etapas">
      <div class="etapas-row etapas-6">${t.etapas.map((e) => `<div class="etapa ${clase(e)}" title="${U.esc(e.desc)} · ${U.esc(e.quien)}">
        <div class="et-n">${e.n}</div><div class="et-lb">${U.esc(e.label)}</div>
        <div class="et-d">${dias(e)}</div>
        <div class="et-st">${e.estado === 'INACTIVA' ? 'Se activa si vence' : e.estado === 'HECHA' ? (e.meta === null || e.meta === undefined ? 'sin meta (falta categoría)' : `meta ${e.unidad === 'h' ? C.textoHoras(e.meta) + ' h' : e.meta + ' d'}`) : e.estado.toLowerCase()}</div>
      </div>`).join('')}</div>
      ${alertas}
      <div class="etapas-pie"><b>${U.esc(t.actual)}</b> · ${t.total === null ? '' : `${t.total} días hábiles desde que se levantó el ticket`}</div>
      ${vig}</div>`;
  }

  function resumen(p) {
    const chip = (l, v) => `<div class="chip"><span>${U.esc(l)}</span><b>${v === '' || v === null || v === undefined ? '—' : v}</b></div>`;
    // v1.9.0: en tickets los indicadores de pedido (existencia, facturación, clasificación…) no aplican; manda el panel de etapas
    if (p.modulo === 'TICKET') return etapasHTML(p);
    return `<div class="chips">
      ${chip('Días naturales', U.esc(p._dias_naturales ?? ''))}
      ${chip('Días incumplimiento', U.esc(p._incumplimiento))}
      ${chip('Días reales entrega', U.esc(p._dias_entrega ?? ''))}
      ${chip('Existencia', U.fmtNumAuto(p.existencia))}
      ${chip('INV', U.esc(p._inv))}
      ${chip('Facturación', U.esc(p._estatus_fact))}
      ${chip('Clasificación', U.esc(p._clasificacion))}
      ${p.modulo === 'SOBREPEDIDO' ? chip('% pago mínimo', U.fmtPct(p._pct_minimo, 0)) + chip('Cumple política', U.esc(p._cumple_politica)) : ''}
    </div>${p.modulo === 'TICKET' ? etapasHTML(p) : ''}`;
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
      ${!S.puedeEditar() ? '' : p.activo === false ? '<button class="btn btn-ghost" data-a="restore">Restaurar</button>' : '<button class="btn btn-danger-ghost" data-a="baja">Dar de baja</button>'}
      <span class="spacer"></span>${S.puedeEditar() ? '<span class="dirty" hidden>Cambios sin guardar</span>' : '<span class="pill pill-ro">🔒 Solo lectura</span>'}
      <button class="btn btn-ghost" data-a="close">Cerrar</button>${S.puedeEditar() ? '<button class="btn btn-primary" data-a="save">Guardar</button>' : '<button class="btn btn-primary" data-a="login">Entrar para editar</button>'}</div>`);
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

    // Tickets: la fecha estimada se calcula con el pago (o autorización) + días del proveedor, salvo que se capture a mano
    const esTk = p.modulo === 'TICKET';
    let manualTk = !!(p.fecha_estimada_manual && U.iso(p.fecha_estimada));
    const setVal = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el && val !== undefined && val !== null) el.value = val; };
    // Recalcular fecha estimada si no es manual
    form.addEventListener('change', (e) => {
      const k = e.target.name;
      if (k === 'fecha_estimada' || k === 'fecha_estimada_inicio') { const man = form.querySelector('[name="fecha_estimada_manual"]'); if (man) man.checked = true; if (esTk) manualTk = !!e.target.value; }
      if (k === 'tiempo_entrega') {
        const t = C.parseTiempoEntrega(e.target.value);
        if (t.ini !== null) { setVal('dias_inicio', t.ini); setVal('dias_fin', t.fin); if (t.tipo) setVal('tipo_dias', t.tipo); }
      }
      if (esTk && ['fecha_pago_proveedor', 'fecha_autorizacion_compra', 'dias_fin', 'tipo_dias', 'tiempo_entrega'].includes(k) && !manualTk) {
        const fe = C.fechaEstimadaTicket({ ...p, ...valores() }, S.hol);
        if (fe) { setVal('fecha_estimada', fe); UI.toast(`Fecha estimada de llegada: ${U.fmtDate(fe)} (pago o autorización + días del proveedor)`, 'info', 4000); }
      }
      if (!esTk && (RECALC_KEYS.includes(k) || k === 'tiempo_entrega' || k === 'fecha_estimada_manual')) {
        const v = valores();
        if (!v.fecha_estimada_manual) {
          const fe = C.fechasEstimadas({ ...p, ...v }, S.hol);
          if (fe.fin) form.querySelector('[name="fecha_estimada"]').value = fe.fin;
          const ini = form.querySelector('[name="fecha_estimada_inicio"]'); if (ini && fe.inicio) ini.value = fe.inicio;
        }
      }
      // Fecha límite de cotización = solicitud + (días de la categoría × 8.5) horas hábiles.
      // No se escribe en el campo: el portal la calcula sola; el campo es solo para forzarla a mano.
      if (esTicket && (k === 'categoria_ticket' || k === 'fecha_solicitud')) {
        const cat = form.querySelector('[name="categoria_ticket"]');
        const dias = C.diasCategoria(cat ? cat.value : '', S.cat.cats);
        const base = form.querySelector('[name="fecha_solicitud"]');
        const fs2 = U.isoDateTime(base && base.value ? base.value : p.fecha_solicitud);
        if (dias !== null && fs2) {
          const lim = C.sumaHorasHabiles(fs2, C.diasAHoras(dias), S.hol);
          if (lim) UI.toast(`Límite de cotización: ${U.fmtDateTime(lim)} (${dias} día(s) = ${C.textoHoras(C.diasAHoras(dias))} h hábiles)`, 'info', 5000);
        }
      }
      // Vencimiento de la cotización = fecha de entrega + vigencia (días naturales)
      if (esTicket && ['fecha_cotizacion_usuario', 'vigencia_dias', 'fecha_recotizacion_usuario', 'vigencia_dias_2'].includes(k)) {
        const seg = k.endsWith('_2') || k === 'fecha_recotizacion_usuario';
        const fBase = form.querySelector(seg ? '[name="fecha_recotizacion_usuario"]' : '[name="fecha_cotizacion_usuario"]');
        const fVig = form.querySelector(seg ? '[name="vigencia_dias_2"]' : '[name="vigencia_dias"]');
        const fVence = form.querySelector(seg ? '[name="fecha_vence_cotizacion_2"]' : '[name="fecha_vence_cotizacion"]');
        if (fBase && fVence && fBase.value) {
          if (!fVig.value) fVig.value = C.METAS_TICKET().vigencia;
          fVence.value = C.venceCotizacion(fBase.value, fVig.value, null);
        }
      }
      if (k === 'fecha_real_llegada') {
        const s = form.querySelector('[name="status_pedido"]');
        const actual = s ? U.norm(s.value) : '';
        if (s && e.target.value && actual === 'PENDIENTE') { s.value = C.statusLlegada(p.modulo); UI.toast(`Status cambiado a ${s.value} (recuerda guardar)`, 'warn'); }
        if (s && !e.target.value && (actual === 'FINALIZADO' || actual === 'ENTREGADO')) { s.value = 'PENDIENTE'; UI.toast('Se borró la fecha real: status regresa a PENDIENTE (recuerda guardar)', 'warn'); }
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

    U.$('[data-a="close"]', d.el).onclick = async () => { if (S.puedeEditar() && Object.keys(cambios()).length && !(await UI.confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?'))) return; d.close(); };
    // Sin sesión: los campos se ven pero no se pueden modificar
    if (!S.puedeEditar()) {
      U.$$('input, select, textarea', form).forEach((el) => { el.disabled = true; });
      U.$('[data-a="login"]', d.el).onclick = () => { d.close(); APP.entrar('Para modificar esta clave necesitas la contraseña.'); };
    }
    // --- Tickets: la etapa 3 (recotización) permanece bloqueada hasta que vence la cotización sin respuesta
    const esTicket = p.modulo === 'TICKET';
    const camposFolio = S.fieldsFor(p.modulo).filter((f) => f.folio).map((f) => f.k);
    if (esTicket) {
      const t = p._etapas || C.etapasTicket(p, S.hoy, S.hol, S.cat.cats);
      const fs = [...U.$$('fieldset', form)].find((x) => U.norm(U.$('legend', x).textContent) === 'ETAPAS DEL TICKET');
      if (fs) {
        const nota = U.h(`<p class="muted small">Estos datos son del <b>ticket completo</b>: al guardar se aplican a las ${S.clavesDelFolio(p).length} clave(s) del folio.</p>`);
        U.$('legend', fs).after(nota);
        if (!t.recotizaActiva && S.puedeEditar()) {
          ['fecha_recotizacion_usuario', 'vigencia_dias_2', 'fecha_vence_cotizacion_2'].forEach((k) => {
            const el = form.querySelector(`[name="${k}"]`); if (el) { el.disabled = true; el.closest('.fld').classList.add('fld-off'); }
          });
          const avisoWrap = form.querySelector('[name="fecha_recotizacion_usuario"]');
          if (avisoWrap) avisoWrap.closest('.fld').insertAdjacentHTML('beforeend', '<small>🔒 Se activa cuando la cotización vence sin respuesta del usuario.</small>');
        }
      }
    }

    const save = U.$('[data-a="save"]', d.el);
    if (save) save.onclick = async () => {
      const ch = cambios();
      if (!Object.keys(ch).length) { UI.toast('No hay cambios', 'warn'); return; }
      if (!APP.requiereEdicion()) return;
      const btn = U.$('[data-a="save"]', d.el); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        // Las etapas del ticket se guardan en todas las claves del folio; lo demás solo en esta clave
        const folio = {}, propio = {};
        for (const [k, v] of Object.entries(ch)) (esTicket && camposFolio.includes(k) ? folio : propio)[k] = v;
        // En tickets la casilla "capturada a mano" no se ve: se marca sola según cómo se obtuvo la fecha
        if (esTicket && 'fecha_estimada' in ch) propio.fecha_estimada_manual = manualTk;
        let msg = '';
        if (Object.keys(folio).length) { const n = await S.updateFolio(p, folio); msg = ` · etapas aplicadas a ${n} clave(s) del folio`; }
        if (Object.keys(propio).length) await S.updatePedido(p.id, propio);
        UI.toast(`Guardado (${Object.keys(ch).length} campo(s))${msg}`);
        d.close(); APP.abrirDetalle(p.id);
      } catch (e) { UI.toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar'; }
    };
    const baja = U.$('[data-a="baja"]', d.el), rest = U.$('[data-a="restore"]', d.el);
    if (baja) baja.onclick = async () => {
      if (!APP.requiereEdicion()) return;
      if (!(await UI.confirm('La clave se ocultará de los tableros. Queda en la bitácora y se puede restaurar desde “Ver dados de baja”. ¿Continuar?', { ok: 'Dar de baja', danger: true }))) return;
      try { await S.updatePedido(p.id, { activo: false }); UI.toast('Clave dada de baja'); d.close(); } catch (e) { UI.toast(e.message, 'error'); }
    };
    if (rest) rest.onclick = async () => {
      if (!APP.requiereEdicion()) return;
      try { await S.updatePedido(p.id, { activo: true }); UI.toast('Clave restaurada'); d.close(); } catch (e) { UI.toast(e.message, 'error'); }
    };
  };
})();
