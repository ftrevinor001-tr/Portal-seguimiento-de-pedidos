/* Componentes de interfaz reutilizables */
(function (root) {
  const UI = {};

  UI.toast = function (msg, type = 'ok', ms = 3800) {
    let box = U.$('#toasts'); if (!box) { box = U.h('<div id="toasts" aria-live="polite"></div>'); document.body.appendChild(box); }
    const el = U.h(`<div class="toast toast-${type}" role="status"><span class="toast-ico">${type === 'error' ? '!' : type === 'warn' ? '⚠' : '✓'}</span><span>${U.esc(msg)}</span></div>`);
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'error' ? Math.max(ms, 7000) : ms);
  };

  UI.loading = function (msg) {
    let el = U.$('#loading');
    if (msg === false) { if (el) el.hidden = true; return; }
    if (!el) { el = U.h('<div id="loading"><div class="loading-card"><div class="spinner"></div><div class="loading-msg"></div><div class="progress" hidden><div class="progress-bar"></div></div></div></div>'); document.body.appendChild(el); }
    el.hidden = false; U.$('.loading-msg', el).textContent = msg || 'Cargando…';
    return {
      progress(done, total, text) {
        const pr = U.$('.progress', el); pr.hidden = false;
        U.$('.progress-bar', pr).style.width = `${total ? Math.round(100 * done / total) : 0}%`;
        if (text) U.$('.loading-msg', el).textContent = text;
      },
      text(t) { U.$('.loading-msg', el).textContent = t; },
    };
  };

  /** Modal centrado. Devuelve {el, close}. */
  UI.modal = function ({ title, subtitle, body, footer, wide, onClose, cls }) {
    const el = U.h(`<div class="modal-back">
      <div class="modal ${wide ? 'modal-wide' : ''} ${cls || ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title || '')}">
        <button class="modal-x" aria-label="Cerrar">×</button>
        ${title ? `<div class="modal-head"><h2>${U.esc(title)}</h2>${subtitle ? `<p>${U.esc(subtitle)}</p>` : ''}</div>` : ''}
        <div class="modal-body"></div>
        ${footer ? '<div class="modal-foot"></div>' : ''}
      </div></div>`);
    const b = U.$('.modal-body', el); if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    if (footer) { const f = U.$('.modal-foot', el); if (typeof footer === 'string') f.innerHTML = footer; else f.appendChild(footer); }
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
    const close = () => { el.remove(); if (!U.$('.modal-back') && !U.$('.drawer-back')) document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
    const esc = (e) => { if (e.key === 'Escape' && el === [...document.querySelectorAll('.modal-back')].pop()) close(); };
    document.addEventListener('keydown', esc);
    U.$('.modal-x', el).onclick = close;
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    return { el, close };
  };

  UI.confirm = (msg, { ok = 'Aceptar', danger } = {}) => new Promise((resolve) => {
    const m = UI.modal({ title: 'Confirmar', body: `<p class="confirm-msg">${U.esc(msg)}</p>`, footer: `<button class="btn btn-ghost" data-r="0">Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${U.esc(ok)}</button>`, onClose: () => resolve(false) });
    U.$$('[data-r]', m.el).forEach((b) => b.onclick = () => { const r = b.dataset.r === '1'; resolve(r); m.close(); });
  });

  /** Panel lateral derecho */
  UI.drawer = function ({ title, body, footer, onClose }) {
    const el = U.h(`<div class="drawer-back"><aside class="drawer" role="dialog" aria-modal="true">
      <button class="modal-x" aria-label="Cerrar">×</button>
      <div class="drawer-head"></div><div class="drawer-body"></div><div class="drawer-foot"></div></aside></div>`);
    if (typeof title === 'string') U.$('.drawer-head', el).innerHTML = title; else if (title) U.$('.drawer-head', el).appendChild(title);
    if (typeof body === 'string') U.$('.drawer-body', el).innerHTML = body; else if (body) U.$('.drawer-body', el).appendChild(body);
    if (footer) { if (typeof footer === 'string') U.$('.drawer-foot', el).innerHTML = footer; else U.$('.drawer-foot', el).appendChild(footer); } else U.$('.drawer-foot', el).remove();
    document.body.appendChild(el); document.body.classList.add('no-scroll');
    requestAnimationFrame(() => el.classList.add('open'));
    const close = () => { el.remove(); if (!U.$('.modal-back') && !U.$('.drawer-back')) document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
    const esc = (e) => { if (e.key === 'Escape' && !U.$('.modal-back')) close(); };
    document.addEventListener('keydown', esc);
    U.$('.modal-x', el).onclick = close;
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    return { el, close };
  };

  const ALERTA_CLS = { 'FUERA DEL PLAZO': 'critical', NOTIFICAR: 'warning', 'DENTRO DEL PLAZO': 'info', FINALIZADO: 'good', CANCELADO: 'muted', 'SIN FECHA': 'muted' };
  const ALERTA_ICO = { 'FUERA DEL PLAZO': '●', NOTIFICAR: '▲', 'DENTRO DEL PLAZO': '◷', FINALIZADO: '✓', CANCELADO: '✕', 'SIN FECHA': '–' };
  UI.alerta = (a) => `<span class="badge badge-${ALERTA_CLS[a] || 'muted'}"><i aria-hidden="true">${ALERTA_ICO[a] || ''}</i>${U.esc(a)}</span>`;
  const STATUS_CLS = { PENDIENTE: 'warning', FINALIZADO: 'good', ENTREGADO: 'good', CANCELADO: 'muted', TERMINADO: 'good' };
  UI.status = (s) => s ? `<span class="badge badge-${STATUS_CLS[U.norm(s)] || 'muted'}">${U.esc(s)}</span>` : '';
  UI.kpi = (label, value, sub, cls) => `<div class="kpi ${cls || ''}"><div class="kpi-label">${U.esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  UI.empty = (msg) => `<div class="empty">${U.esc(msg)}</div>`;

  /**
   * Tabla ordenable con desplazamiento continuo, como una hoja de Excel (v1.6.0):
   * no hay botón "Siguiente"; al bajar con el scroll se agregan más renglones y el
   * encabezado se queda fijo. cols: [{k, label, render(row), sort(row), cls, width}]
   */
  UI.table = function (container, { cols, rows, bloque = 150, pageSize, onRow, selectable, rowKey = (r) => r.id, sortKey, sortDir = 1, emptyMsg = 'Sin registros con estos filtros.', alto = false, cls = '', pieExtra = null, ampliar = false }) {
    if (pageSize) bloque = pageSize; // compatibilidad con llamadas antiguas
    const st = { sortKey, sortDir, selected: new Set(), shown: 0 };
    const nCols = cols.length + (selectable ? 1 : 0);
    let data = [], porClave = new Map(), wrap = null, tbody = null, pie = null;

    function sorted() {
      if (!st.sortKey) return rows.slice();
      const c = cols.find((x) => x.k === st.sortKey); const get = c && c.sort ? c.sort : (r) => r[st.sortKey];
      return rows.slice().sort((a, b) => {
        let va = get(a), vb = get(b);
        const ea = va === null || va === undefined || va === '', eb = vb === null || vb === undefined || vb === '';
        if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * st.sortDir;
        return String(va).localeCompare(String(vb), 'es', { numeric: true }) * st.sortDir;
      });
    }

    const fila = (r) => {
      const k = rowKey(r), sel = st.selected.has(k);
      return `<tr data-id="${U.esc(k)}" class="${onRow ? 'clickable' : ''} ${sel ? 'row-sel' : ''}">${selectable ? `<td class="sel"><input type="checkbox" class="sel-one" ${sel ? 'checked' : ''} aria-label="Seleccionar"></td>` : ''}${cols.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : U.esc(r[c.k] ?? '')}</td>`).join('')}</tr>`;
    };

    function pintarPie() {
      if (!pie) return;
      const falta = data.length - st.shown;
      const izq = pieExtra ? pieExtra() : `${U.fmtNum(data.length)} ${data.length === 1 ? 'registro' : 'registros'}`;
      pie.innerHTML = `<span class="pager-izq">${izq}${selectable && st.selected.size ? ` · <b>${st.selected.size} seleccionados</b>` : ''}</span>
        <span class="pager-pos">${!data.length ? '' : falta > 0
          ? `Mostrando ${U.fmtNum(st.shown)} de ${U.fmtNum(data.length)} · <button class="btn btn-sm btn-ghost" data-todo="1">Mostrar todos</button>`
          : data.length === 1 ? 'Se muestra el único renglón' : `Se muestran los ${U.fmtNum(data.length)} renglones`}
          ${ampliar ? `<button class="btn btn-sm btn-ghost" data-ampliar="1" title="Ocultar encabezado y filtros para ver más renglones (Esc para salir)">${document.body.classList.contains('tabla-max') ? '⤡ Salir de pantalla completa' : '⤢ Pantalla completa'}</button>` : ''}</span>`;
      const amp = U.$('[data-ampliar]', pie);
      if (amp) amp.onclick = () => UI.pantallaCompleta(!document.body.classList.contains('tabla-max'));
      const b = U.$('[data-todo]', pie);
      if (b) b.onclick = () => {
        const ld = data.length - st.shown > 800 ? UI.loading('Mostrando todos los renglones…') : null;
        setTimeout(() => { while (st.shown < data.length) agregar(); pintarPie(); if (ld) UI.loading(false); }, 20);
      };
    }

    /** ¿El final de la tabla está cerca de la vista? (sirve con scroll propio o de la página) */
    function cerca() {
      if (!tbody || !document.body.contains(tbody)) return false;
      if (alto && wrap.scrollHeight > wrap.clientHeight + 4) return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 600;
      const r = wrap.getBoundingClientRect();
      return r.bottom - window.innerHeight < 600;
    }
    function agregar() {
      if (st.shown >= data.length) return false;
      const next = data.slice(st.shown, st.shown + bloque);
      tbody.insertAdjacentHTML('beforeend', next.map(fila).join(''));
      st.shown += next.length;
      return true;
    }
    function rellenar() {
      let g = 0;
      while (st.shown < data.length && cerca() && g++ < 200) agregar();
      pintarPie();
    }
    function alScroll() {
      if (!tbody || !document.body.contains(tbody)) { window.removeEventListener('scroll', alScroll); return; }
      rellenar();
    }

    const sincronizarTodos = () => {
      const all = U.$('.sel-all', container);
      if (all) all.checked = !!data.length && st.selected.size >= data.length && data.every((r) => st.selected.has(rowKey(r)));
    };

    function draw() {
      data = sorted(); st.shown = 0;
      porClave = new Map(data.map((r) => [String(rowKey(r)), r]));
      container.innerHTML = `
        <div class="table-wrap ${alto ? 'alto' : ''}"><table class="grid ${cls}">
          <thead><tr>${selectable ? '<th class="sel"><input type="checkbox" class="sel-all" title="Seleccionar todos los renglones del filtro" aria-label="Seleccionar todo"></th>' : ''}${cols.map((c) => `<th data-k="${c.k}" class="${c.cls || ''} ${st.sortKey === c.k ? (st.sortDir > 0 ? 'ord-asc' : 'ord-desc') : ''}" ${c.width ? `style="min-width:${c.width}"` : ''}>${U.esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody></tbody>
        </table></div>
        <div class="pager"></div>`;
      wrap = U.$('.table-wrap', container); tbody = U.$('tbody', container); pie = U.$('.pager', container);
      U.$$('th[data-k]', container).forEach((th) => th.onclick = () => { const k = th.dataset.k; if (st.sortKey === k) st.sortDir *= -1; else { st.sortKey = k; st.sortDir = 1; } draw(); });

      if (!data.length) { tbody.innerHTML = `<tr><td colspan="${nCols}">${UI.empty(emptyMsg)}</td></tr>`; pintarPie(); return; }

      agregar(); rellenar();
      wrap.addEventListener('scroll', alScroll, { passive: true });
      window.addEventListener('scroll', alScroll, { passive: true }); // por si la pantalla es angosta y se desplaza la página

      if (onRow) tbody.addEventListener('click', (e) => {
        if (e.target.closest('.sel')) return;
        const tr = e.target.closest('tr[data-id]'); if (!tr) return;
        const r = porClave.get(tr.dataset.id); if (r) onRow(r);
      });
      if (selectable) {
        tbody.addEventListener('change', (e) => {
          const cb = e.target.closest('.sel-one'); if (!cb) return;
          const tr = cb.closest('tr'); const r = porClave.get(tr.dataset.id); if (!r) return;
          if (cb.checked) st.selected.add(rowKey(r)); else st.selected.delete(rowKey(r));
          tr.classList.toggle('row-sel', cb.checked);
          sincronizarTodos(); pintarPie(); api.onSelect && api.onSelect(st.selected);
        });
        const all = U.$('.sel-all', container);
        if (all) {
          sincronizarTodos();
          all.onchange = () => {
            data.forEach((r) => all.checked ? st.selected.add(rowKey(r)) : st.selected.delete(rowKey(r)));
            U.$$('.sel-one', tbody).forEach((cb) => { cb.checked = all.checked; cb.closest('tr').classList.toggle('row-sel', all.checked); });
            pintarPie(); api.onSelect && api.onSelect(st.selected);
          };
        }
      }
    }

    const api = {
      setRows(r) { rows = r; const keys = new Set(r.map(rowKey)); [...st.selected].forEach((k) => { if (!keys.has(k)) st.selected.delete(k); }); draw(); },
      selected: () => st.selected, clearSelection() { st.selected.clear(); draw(); }, redraw: draw,
      selectAll() { rows.forEach((r) => st.selected.add(rowKey(r))); draw(); api.onSelect && api.onSelect(st.selected); },
      onSelect: null,
    };
    draw();
    return api;
  };

  /** Pantalla completa de la tabla (v1.8.0): oculta encabezado y filtros; Esc para salir */
  UI.pantallaCompleta = function (on) {
    document.body.classList.toggle('tabla-max', !!on);
    U.$$('[data-ampliar]').forEach((b) => { b.textContent = on ? '⤡ Salir de pantalla completa' : '⤢ Pantalla completa'; });
    if (root.APP && APP.medirTop) setTimeout(APP.medirTop, 20);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('tabla-max') && !U.$('.modal-back') && !U.$('.drawer-back')) UI.pantallaCompleta(false);
  });

  /** Barra apilada horizontal con leyenda (status) */
  UI.stackBar = function (segs, { height = 30 } = {}) {
    const total = segs.reduce((a, s) => a + s.value, 0);
    if (!total) return `<div class="stack-empty">Sin claves para medir</div>`;
    return `<div class="stack" style="height:${height}px" role="img" aria-label="${segs.map((s) => `${s.label}: ${s.value}`).join(', ')}">${segs.filter((s) => s.value > 0).map((s) => {
      const pct = 100 * s.value / total;
      return `<div class="stack-seg" style="flex:${s.value};background:${s.color}" data-tip="${U.esc(s.label)}: ${U.fmtNum(s.value)} (${pct.toFixed(1)}%)">${height >= 20 && pct >= 12 ? `<span>${pct.toFixed(1)}%</span>` : ''}</div>`;
    }).join('')}</div>`;
  };
  UI.COLORS = { DENTRO: '#0ca30c', FUERA: '#ec835a', PEND_VENCIDA: '#d03b3b', PEND_EN_PLAZO: '#a8a69c', CANCELADO: '#d4d2c9', NOTIFICAR: '#fab219', SERIE: '#2a78d6' };

  // Tooltip global para [data-tip]
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]'); let tip = U.$('#tip');
    if (!t) { if (tip) tip.hidden = true; return; }
    if (!tip) { tip = U.h('<div id="tip" role="tooltip"></div>'); document.body.appendChild(tip); }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const r = t.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 8 < 0 ? r.bottom + 8 : r.top - tip.offsetHeight - 8}px`;
  });

  /** Campo de formulario según definición */
  UI.field = function (f, value, { modulo, disabled, datalistId } = {}) {
    const id = `f_${f.k}`;
    const v = value === null || value === undefined ? '' : value;
    let input;
    const dis = disabled ? 'disabled' : '';
    switch (f.type) {
      case 'textarea': input = `<textarea id="${id}" name="${f.k}" rows="2" ${dis}>${U.esc(v)}</textarea>`; break;
      case 'select': {
        const opts = S.lista(f.list, modulo);
        const all = v !== '' && !opts.includes(v) ? [v, ...opts] : opts;
        input = `<select id="${id}" name="${f.k}" ${dis}>${U.options(all, v, { empty: '—' })}</select>`; break;
      }
      case 'bool': input = `<label class="chk"><input type="checkbox" id="${id}" name="${f.k}" ${v ? 'checked' : ''} ${dis}> Sí</label>`; break;
      case 'date': input = `<input type="date" id="${id}" name="${f.k}" value="${U.esc(U.iso(v) || '')}" ${dis}>`; break;
      case 'datetime': input = `<input type="datetime-local" step="1" id="${id}" name="${f.k}" value="${U.esc(U.isoDateTime(v) || '')}" ${dis}>`; break;
      case 'pct': input = `<input type="number" step="1" min="0" max="100" id="${id}" name="${f.k}" value="${v === '' ? '' : Math.round(Number(v) * 100)}" placeholder="%" ${dis}>`; break;
      case 'num': case 'money': input = `<input type="number" step="any" id="${id}" name="${f.k}" value="${U.esc(v)}" ${dis}>`; break;
      default: input = `<input type="text" id="${id}" name="${f.k}" value="${U.esc(v)}" ${f.list ? `list="dl_${f.list}"` : ''} ${dis}>`;
    }
    return `<div class="fld fld-${f.type}"><label for="${id}">${U.esc(f.label)}</label>${input}</div>`;
  };
  UI.datalists = function (names, modulo) {
    return names.map((n) => `<datalist id="dl_${n}">${S.lista(n, modulo).map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>`).join('');
  };
  /** Lee valores de un formulario con campos definidos */
  UI.readFields = function (root, keys) {
    const out = {};
    for (const k of keys) {
      const el = root.querySelector(`[name="${k}"]`); if (!el) continue;
      const f = S.FIELD[k];
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (f && f.type === 'pct' && v !== '') v = Number(v) / 100;
      out[k] = S.coerce(k, v);
    }
    return out;
  };

  root.UI = UI;
})(window);
