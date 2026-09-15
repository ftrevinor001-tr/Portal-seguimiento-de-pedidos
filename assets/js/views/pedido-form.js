/* Formulario "Nuevo pedido": captura por folio con varias claves */
(function () {
  const PLANTILLA = 'CLAVE,DESCRIPCION,CANTIDAD\r\n';
  const LS_MODO = 'sp_modo_comprador';

  APP.nuevoPedido = function () {
    if (!APP.requiereEdicion('Para capturar un pedido necesitas la contraseña.')) return;
    const hoy = S.hoy;
    let modoGuardado = null;
    try { modoGuardado = localStorage.getItem(LS_MODO); } catch { /* sin storage */ }
    const st = { tipo: 'ENTREGA DIRECTA', lineas: [], manualTE: false, manualTD: false, compModo: C.MODOS_COMPRADOR.includes(modoGuardado) ? modoGuardado : 'CLAVES' };
    const body = U.h(`<form class="pf" autocomplete="off">
      <section class="pf-sec"><h3>Tipo de solicitud</h3>
        <div class="grid-fields"><div class="fld"><label for="pf_tipo">Selecciona el tipo de solicitud *</label><select id="pf_tipo" name="tipo">${U.options(C.TIPOS_SOLICITUD, st.tipo)}</select><small>La captura se adapta según el tipo seleccionado.</small></div></div>
      </section>
      <section class="pf-sec"><h3>Datos generales</h3>
        <div class="grid-fields">
          <div class="fld"><label for="pf_fecha">Fecha de solicitud *</label><input type="date" id="pf_fecha" name="fecha" value="${hoy}" required><small>Se guarda con la hora actual y genera AÑO y MES.</small></div>
          <div class="fld"><label>Asignación del comprador *</label><div class="seg seg-sm" id="pf_compModo" role="group" aria-label="Asignación del comprador"><button type="button" data-m="CLAVES">Según las claves</button><button type="button" data-m="MANUAL">Manual</button></div><small id="pf_compModoHint"></small></div>
          <div class="fld"><label for="pf_comprador" id="pf_compLbl">Comprador asignado *</label><input id="pf_comprador" name="comprador" list="dl_COMPRADOR"><small id="pf_compHint"></small></div>
          <div class="fld"><label for="pf_solicitante">Solicitante *</label><input id="pf_solicitante" name="solicitante" list="dl_SOLICITANTE" placeholder="Ej. BODEGA" required></div>
          <div class="fld"><label for="pf_area">Área *</label><input id="pf_area" name="area" list="dl_AREA" placeholder="Ej. CALL CENTER" required></div>
          <div class="fld"><label for="pf_proveedor">Proveedor <span class="req-ed">*</span></label><input id="pf_proveedor" name="proveedor" list="dl_PROVEEDOR" placeholder="Ej. CEMIX MEXICO SA DE CV"></div>
          <div class="fld only-edt"><label for="pf_material">Tipo de material</label><input id="pf_material" name="tipo_material" list="dl_TIPO_MATERIAL" placeholder="Ej. CEMENTO"></div>
          <div class="fld"><label for="pf_folio">Folio del pedido *</label><input id="pf_folio" name="folio_pedido" placeholder="No dejar vacío" required></div>
          <div class="fld"><label for="pf_oc">ID / OC</label><input id="pf_oc" name="id_oc"></div>
          <div class="fld only-ed"><label for="pf_directo">Directo Sanver</label><select id="pf_directo" name="directo_sanver">${U.options(['DG', 'SUCURSAL'], 'DG', { empty: '—' })}</select></div>
          <div class="fld only-sp"><label for="pf_clasif">Clasificación de política</label><select id="pf_clasif" name="validacion_clasificacion">${U.options(C.CLASIF_POLITICA, '', { empty: '—' })}</select></div>
          <div class="fld fld-wide"><label for="pf_coment">Comentarios</label><input id="pf_coment" name="comentarios"></div>
        </div>
        <div class="pf-sub">Parámetros logísticos</div>
        <label class="chk box"><input type="checkbox" id="pf_manTE"> Captura manual de tiempo de entrega</label>
        <div class="grid-fields g4">
          <div class="fld"><label for="pf_te">Tiempo de entrega</label><input id="pf_te" readonly placeholder="Se muestra automáticamente"></div>
          <div class="fld"><label for="pf_da">Días A</label><input id="pf_da" type="number" min="0" readonly placeholder="Ej. 3"></div>
          <div class="fld"><label for="pf_db">Días B</label><input id="pf_db" type="number" min="0" readonly placeholder="Ej. 7"></div>
          <div class="fld"><label for="pf_tipodias">Tipo de días</label><select id="pf_tipodias" disabled>${U.options(['NATURALES', 'HABILES'], 'NATURALES')}</select></div>
        </div>
        <div class="pf-info" id="pf_teInfo"></div>
        <div class="only-edt">
          <div class="pf-sub">Tiempo de descarga</div>
          <label class="chk box"><input type="checkbox" id="pf_manTD"> Captura manual de tiempo de descarga</label>
          <div class="grid-fields g4"><div class="fld"><label for="pf_td">Tiempo de descarga (hrs)</label><input id="pf_td" type="number" step="0.5" min="0" readonly placeholder="Se muestra automáticamente"></div></div>
        </div>
      </section>
      <section class="pf-sec"><h3>Claves del pedido</h3>
        <div class="pf-upload">
          <div><b>Carga masiva (CSV o Excel)</b><small>Columnas: CLAVE, DESCRIPCION, CANTIDAD. En Entrega directa, Sobrepedido y Pedido especial la descripción se toma del maestro de artículos.</small></div>
          <input type="file" id="pf_file" accept=".csv,.xlsx,.txt">
          <button type="button" class="btn btn-ghost btn-sm" id="pf_tpl">Descargar plantilla CSV</button>
        </div>
        <div class="pf-manual"><label for="pf_n">Carga manual · número de claves</label><input id="pf_n" type="number" min="1" max="300" placeholder="Ej. 3"><button type="button" class="btn btn-ghost btn-sm" id="pf_addRows">Agregar filas</button><button type="button" class="btn btn-ghost btn-sm" id="pf_clear">Limpiar</button></div>
        <div id="pf_lines"></div>
        <div id="pf_compInfo" class="pf-comp"></div>
      </section>
      ${UI.datalists(['COMPRADOR', 'SOLICITANTE', 'AREA', 'PROVEEDOR', 'TIPO_MATERIAL'])}
    </form>`);
    const m = UI.modal({ title: 'Nuevo pedido', subtitle: 'Captura por folio. El tiempo de entrega y de descarga se calculan con los catálogos.', body, wide: true, cls: 'modal-form',
      footer: '<span class="pf-count" id="pf_count"></span><button class="btn btn-ghost" data-a="c">Cancelar</button><button class="btn btn-success" data-a="s">Guardar pedido</button>' });
    const $ = (s) => U.$(s, m.el);
    const modulo = () => C.moduloDeTipo(st.tipo);

    function adapt() {
      const mod = modulo();
      U.$$('.only-sp', m.el).forEach((x) => { x.hidden = mod !== 'SOBREPEDIDO'; });
      U.$$('.only-ed', m.el).forEach((x) => { x.hidden = mod !== 'ENTREGA_DIRECTA'; });
      U.$$('.only-edt', m.el).forEach((x) => { x.hidden = mod === 'SOBREPEDIDO'; });
      U.$$('.req-ed', m.el).forEach((x) => { x.hidden = mod !== 'ENTREGA_DIRECTA'; });
      calcular(); drawLines();
    }

    function calcular() {
      const mod = modulo();
      const prov = $('#pf_proveedor').value, sol = $('#pf_solicitante').value;
      const info = [];
      if (!st.manualTE) {
        const cat = S.buscarTiempoEntrega(prov, sol);
        if (cat && cat.dias_fin !== null) {
          $('#pf_da').value = cat.dias_inicio ?? cat.dias_fin; $('#pf_db').value = cat.dias_fin;
          $('#pf_tipodias').value = mod === 'SOBREPEDIDO' ? 'HABILES' : (cat.tipo_dias || 'NATURALES');
          $('#pf_te').value = cat.tiempo_entrega || C.textoTiempoEntrega(cat.dias_inicio, cat.dias_fin, $('#pf_tipodias').value);
          if (U.norm(cat.entrega_directa) === 'NO' && mod === 'ENTREGA_DIRECTA') info.push(`<span class="warn">⚠ El catálogo indica que ${U.esc(prov)} NO hace entrega directa a ${U.esc(sol)}.</span>`);
        } else {
          $('#pf_da').value = ''; $('#pf_db').value = ''; $('#pf_te').value = '';
          if (prov && sol) info.push(`<span class="warn">⚠ No hay tiempo de entrega en el catálogo para ${U.esc(prov)} → ${U.esc(sol)}. Marca “Captura manual”.</span>`);
          if (mod === 'SOBREPEDIDO') $('#pf_tipodias').value = 'HABILES';
        }
      } else {
        $('#pf_te').value = C.textoTiempoEntrega($('#pf_da').value, $('#pf_db').value || $('#pf_da').value, $('#pf_tipodias').value);
      }
      if (!st.manualTD) {
        const td = S.buscarTiempoDescarga(prov, $('#pf_material').value);
        $('#pf_td').value = td ? td.horas : '';
      }
      const p = { modulo: mod, fecha_solicitud: $('#pf_fecha').value, dias_inicio: $('#pf_da').value, dias_fin: $('#pf_db').value, tipo_dias: $('#pf_tipodias').value };
      const fe = C.fechasEstimadas(p, S.hol);
      if (fe.fin) {
        info.unshift(`Fecha estimada${mod === 'SOBREPEDIDO' ? ' de llegada' : ''}: ${fe.inicio && fe.inicio !== fe.fin ? `<b>${U.fmtDate(fe.inicio)}</b> a ` : ''}<b>${U.fmtDate(fe.fin)}</b> (${p.tipo_dias === 'HABILES' ? 'días hábiles L-V' : 'días naturales'})`);
        const noRecibe = S.diaNoRecibe(sol);
        const d = U.DIAS_SEMANA[U.weekday(fe.fin)];
        if (noRecibe.includes(d)) info.push(`<span class="warn">⚠ ${U.esc(sol)} no recibe los ${d.toLowerCase()} y la fecha estimada cae en ${d.toLowerCase()}.</span>`);
      }
      $('#pf_teInfo').innerHTML = info.join('<br>');
    }

    /* ----- Líneas ----- */
    function celdaComprador(l) {
      const maestro = l.compradores && l.compradores.length ? l.compradores : [];
      if (st.compModo === 'MANUAL') {
        return maestro.length ? `<span class="muted" title="Comprador en el maestro (solo referencia)">${U.esc(maestro.join(' / '))}</span>` : '<span class="muted">—</span>';
      }
      const actual = U.norm(l.comprador);
      let ref = '';
      if (maestro.length > 1) ref = `Maestro: ${maestro.join(' / ')}`;
      else if (maestro.length && actual && actual !== maestro[0]) ref = `Maestro: ${maestro[0]}`;
      else if (!maestro.length && l.clave && l.clave !== 'NUEVO') ref = 'Sin comprador en el maestro';
      return `<input class="in-comp" list="dl_COMPRADOR" value="${U.esc(l.comprador || '')}" placeholder="${U.esc(compradorComun() || 'Comprador')}">${ref ? `<small class="ref">${U.esc(ref)}</small>` : ''}`;
    }
    function drawLines() {
      const mod = modulo(), ticket = mod === 'TICKET';
      const box = $('#pf_lines');
      if (!st.lineas.length) { box.innerHTML = UI.empty('Agrega claves con carga masiva o manual.'); $('#pf_count').textContent = ''; resumenComprador(); return; }
      const thComp = st.compModo === 'MANUAL' ? 'Comprador en maestro' : 'Comprador';
      box.innerHTML = `<div class="table-wrap"><table class="grid compact lines"><thead><tr><th>#</th><th>Clave</th><th>Descripción</th><th>Marca</th><th>Unidad</th><th>${thComp}</th><th class="num">Existencia</th><th class="num">Cantidad *</th><th></th></tr></thead><tbody>
        ${st.lineas.map((l, i) => `<tr data-i="${i}" class="${l.err ? 'row-err' : ''}"><td>${i + 1}</td>
          <td><input class="in-clave" value="${U.esc(l.clave || '')}" placeholder="Clave o NUEVO"></td>
          <td><input class="in-desc" value="${U.esc(l.descripcion || '')}" ${!ticket && l.art ? 'readonly' : ''} placeholder="${ticket ? 'Descripción' : 'Se toma del maestro'}"></td>
          <td>${U.esc(l.marca || '')}</td><td>${U.esc(l.unidad || '')}</td><td class="td-comp">${celdaComprador(l)}</td><td class="num">${U.fmtNumAuto(l.existencia)}</td>
          <td><input class="in-cant" type="number" min="0" step="any" value="${U.esc(l.cantidad ?? '')}"></td>
          <td><button type="button" class="btn-icon" data-del="${i}" aria-label="Quitar">✕</button></td></tr>
          ${l.err ? `<tr class="row-err-msg"><td></td><td colspan="8">${U.esc(l.err)}</td></tr>` : ''}`).join('')}
      </tbody></table></div>`;
      $('#pf_count').textContent = `${st.lineas.length} clave(s)`;
      U.$$('tbody tr[data-i]', box).forEach((tr) => {
        const l = st.lineas[+tr.dataset.i];
        U.$('.in-clave', tr).addEventListener('change', async (e) => { l.clave = U.norm(e.target.value); await completar([l]); drawLines(); });
        U.$('.in-desc', tr).addEventListener('input', (e) => { l.descripcion = e.target.value; });
        U.$('.in-cant', tr).addEventListener('input', (e) => { l.cantidad = e.target.value; });
        const ic = U.$('.in-comp', tr);
        if (ic) {
          ic.addEventListener('input', (e) => { l.comprador = e.target.value; resumenComprador(); });
          ic.addEventListener('change', (e) => {
            l.comprador = U.norm(e.target.value); e.target.value = l.comprador;
            // Solo se actualiza la referencia del maestro, sin redibujar (no se pierde el foco)
            const tmp = U.h(`<div>${celdaComprador(l)}</div>`), ref = U.$('small.ref', tmp), old = U.$('small.ref', tr);
            if (old) old.remove();
            if (ref) ic.after(ref);
            resumenComprador();
          });
        }
      });
      U.$$('[data-del]', box).forEach((b) => b.onclick = () => { st.lineas.splice(+b.dataset.del, 1); drawLines(); });
      resumenComprador();
    }

    /** Comprador que comparten las claves (modo Según las claves). '' si no hay o si son varios. */
    function compradoresDeLineas() { return U.uniq(st.lineas.filter((l) => l.clave || l.descripcion).map((l) => U.norm(l.comprador)).filter(Boolean)); }
    function compradorComun() { const c = compradoresDeLineas(); return c.length === 1 ? c[0] : ''; }
    /** Comprador general con el que se completan las claves: el escrito (Manual) o el común de las claves */
    function compradorGeneral() { return st.compModo === 'MANUAL' ? $('#pf_comprador').value : compradorComun(); }

    /** Modo de asignación: textos y comportamiento del campo "Comprador asignado" */
    function aplicarModo() {
      U.$$('#pf_compModo button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.m === st.compModo));
      const inp = $('#pf_comprador');
      $('#pf_compLbl').textContent = 'Comprador asignado *';
      if (st.compModo === 'MANUAL') {
        inp.readOnly = false;
        inp.placeholder = 'Ej. ARICELIA';
        $('#pf_compHint').textContent = 'Se guarda en todas las claves del pedido.';
        $('#pf_compModoHint').textContent = 'Tú escribes el comprador; no depende de las claves.';
      } else {
        inp.readOnly = true;
        inp.placeholder = 'Se asigna con las claves';
        $('#pf_compHint').textContent = 'Se llena solo con el comprador de las claves. Para escribirlo tú, elige Manual.';
        $('#pf_compModoHint').textContent = 'Cada clave toma su comprador del maestro; puedes cambiarlo en la tabla.';
        sincronizarCampo();
      }
    }
    /** En modo Según las claves, el campo muestra el comprador de las claves */
    function sincronizarCampo() {
      if (st.compModo !== 'CLAVES') return;
      const c = compradoresDeLineas();
      $('#pf_comprador').value = c.length === 1 ? c[0] : c.length > 1 ? `VARIOS: ${c.join(', ')}` : '';
      const ph = c.length === 1 ? c[0] : 'Comprador';
      U.$$('#pf_lines .in-comp', m.el).forEach((x) => { x.placeholder = ph; });
    }

    /** Resumen informativo (no bloquea): con qué comprador se guardará cada clave */
    function resumenComprador() {
      sincronizarCampo();
      const box = $('#pf_compInfo');
      const lineas = st.lineas.filter((l) => l.clave || l.descripcion);
      if (!lineas.length) { box.innerHTML = ''; return null; }
      const r = C.resumenCompradores(lineas, st.compModo, compradorGeneral());
      const msgs = [];
      if (r.compradores.length) {
        const lista = r.compradores.map((c) => `<b>${U.esc(c.comprador)}</b> (${c.claves} clave${c.claves === 1 ? '' : 's'})`).join(' · ');
        msgs.push(`<div class="info-box">Se guardará con: ${lista}${r.compradores.length > 1 ? ' — cada clave con su comprador.' : ''}</div>`);
      }
      if (r.sinComprador.length) {
        msgs.push(`<div class="warn-box">${st.compModo === 'MANUAL' ? 'Escribe el comprador del pedido.' : `${r.sinComprador.length} clave(s) sin comprador: ${r.sinComprador.slice(0, 10).map(U.esc).join(', ')}${r.sinComprador.length > 10 ? '…' : ''}. Escríbelo en la columna Comprador de la tabla o elige Manual.`}</div>`);
      }
      if (r.difiereMaestro.length) {
        msgs.push(`<div class="muted small">Referencia: ${r.difiereMaestro.length} clave(s) con un comprador distinto al del maestro (${r.difiereMaestro.slice(0, 5).map((d) => `${U.esc(d.clave)} → maestro ${U.esc(d.maestro.join(' / '))}`).join(', ')}${r.difiereMaestro.length > 5 ? '…' : ''}). No impide guardar.</div>`);
      }
      if (S.artSinComprador && st.compModo === 'CLAVES') msgs.push('<div class="muted small">El maestro de artículos aún no tiene la columna COMPRADOR: captura el comprador en cada clave o usa el modo Manual.</div>');
      box.innerHTML = msgs.join('');
      return r;
    }

    async function completar(lineas) {
      const claves = lineas.map((l) => l.clave).filter((c) => c && c !== 'NUEVO');
      let arts = {};
      try { arts = claves.length ? await S.articulos(claves) : {}; } catch (e) { UI.toast(`No se pudo consultar el maestro: ${e.message}`, 'warn'); }
      for (const l of lineas) {
        const a = l.clave && l.clave !== 'NUEVO' ? arts[l.clave] : null;
        l.art = a; l.err = ''; l.compradores = a ? C.compradoresDeClave(a.comprador) : [];
        const gen = st.compModo === 'MANUAL' ? U.norm($('#pf_comprador').value) : '';
        l.comprador = gen && l.compradores.includes(gen) ? gen : (l.compradores[0] || '');
        if (a) { if (modulo() !== 'TICKET' || !l.descripcion) l.descripcion = a.descripcion; l.marca = a.marca; l.unidad = a.unidad; l.existencia = a.existencia; }
        else { l.marca = l.marca || ''; l.existencia = null; if (l.clave && l.clave !== 'NUEVO' && modulo() !== 'TICKET') l.err = 'Clave no encontrada en el maestro de artículos: captura la descripción o usa NUEVO.'; }
      }
    }

    $('#pf_tipo').onchange = (e) => { st.tipo = e.target.value; adapt(); };
    ['#pf_proveedor', '#pf_solicitante', '#pf_material', '#pf_fecha'].forEach((s) => $(s).addEventListener('change', calcular));
    $('#pf_manTE').onchange = (e) => { st.manualTE = e.target.checked; ['#pf_da', '#pf_db'].forEach((s) => { $(s).readOnly = !st.manualTE; }); $('#pf_tipodias').disabled = !st.manualTE; calcular(); };
    ['#pf_da', '#pf_db', '#pf_tipodias'].forEach((s) => $(s).addEventListener('change', calcular));
    $('#pf_manTD').onchange = (e) => { st.manualTD = e.target.checked; $('#pf_td').readOnly = !st.manualTD; calcular(); };
    $('#pf_tpl').onclick = () => XL.download(new Blob([`\uFEFF${PLANTILLA}`], { type: 'text/csv;charset=utf-8' }), 'plantilla_claves.csv');
    $('#pf_addRows').onclick = () => { const n = Math.min(300, Math.max(1, +$('#pf_n').value || 1)); for (let i = 0; i < n; i++) st.lineas.push({ clave: '', descripcion: '', cantidad: '' }); drawLines(); };
    $('#pf_clear').onclick = () => { st.lineas = []; $('#pf_file').value = ''; drawLines(); };
    $('#pf_comprador').addEventListener('input', () => { if (st.compModo === 'MANUAL') resumenComprador(); });
    U.$$('#pf_compModo button', m.el).forEach((b) => b.onclick = () => {
      if (st.compModo === b.dataset.m) return;
      if (st.compModo === 'MANUAL') st.compManual = $('#pf_comprador').value;
      st.compModo = b.dataset.m;
      try { localStorage.setItem(LS_MODO, st.compModo); } catch { /* sin storage */ }
      // Al pasar a Manual se conserva lo que ya se había escrito; si no hay, se propone el comprador común de las claves
      if (st.compModo === 'MANUAL') $('#pf_comprador').value = st.compManual || compradorComun();
      aplicarModo(); drawLines();
    });
    $('#pf_file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const wb = await XL.readFile(f);
        const { rows } = XL.toObjects(await wb.rows(wb.sheetNames[0]));
        const pick = (o, names) => { const k = Object.keys(o).find((x) => names.includes(U.norm(x))); return k ? o[k] : null; };
        const nuevas = rows.map((o) => ({ clave: U.norm(pick(o, ['CLAVE', 'IDARTICULO', 'CODIGO']) ?? ''), descripcion: pick(o, ['DESCRIPCION', 'DESCRIPCIÓN']) || '', cantidad: pick(o, ['CANTIDAD', 'CANT', 'CANTIDAD SOLICITADA']) })).filter((l) => l.clave || l.descripcion);
        if (!nuevas.length) { UI.toast('El archivo no tiene filas con CLAVE/DESCRIPCION/CANTIDAD', 'warn'); return; }
        const ld = UI.loading('Buscando claves en el maestro…');
        try { await completar(nuevas); } finally { UI.loading(false); }
        st.lineas = nuevas; drawLines();
        UI.toast(`${nuevas.length} claves cargadas (la carga masiva reemplaza la captura manual)`);
      } catch (er) { UI.toast(`No se pudo leer el archivo: ${er.message}`, 'error'); }
    };

    U.$('[data-a="c"]', m.el).onclick = async () => { if (st.lineas.length && !(await UI.confirm('Se perderá la captura. ¿Cancelar?'))) return; m.close(); };
    U.$('[data-a="s"]', m.el).onclick = async () => {
      const mod = modulo();
      const v = (s) => $(s).value.trim();
      const falt = [];
      if (!v('#pf_fecha')) falt.push('fecha de solicitud');
      if (!v('#pf_solicitante')) falt.push('solicitante');
      if (!v('#pf_area')) falt.push('área');
      if (!v('#pf_folio')) falt.push('folio del pedido');
      if (mod === 'ENTREGA_DIRECTA' && !v('#pf_proveedor')) falt.push('proveedor');
      const lineas = st.lineas.filter((l) => l.clave || l.descripcion);
      if (!lineas.length) falt.push('al menos una clave');
      if (lineas.some((l) => !(Number(l.cantidad) > 0))) falt.push('cantidad en todas las claves');
      if (lineas.some((l) => !l.descripcion)) falt.push('descripción en todas las claves');
      const general = compradorGeneral();
      const rc = C.resumenCompradores(lineas, st.compModo, general);
      if (lineas.length && rc.sinComprador.length) falt.push(st.compModo === 'MANUAL' ? 'comprador' : `comprador en ${rc.sinComprador.length} clave(s)`);
      if (falt.length) {
        UI.toast(`Falta: ${falt.join(', ')}`, 'warn', 6000);
        if (rc.sinComprador.length && lineas.length) resumenComprador();
        return;
      }
      const folio = U.norm(v('#pf_folio'));
      const existentes = S.pedidos.filter((p) => U.norm(p.folio_pedido) === folio).length;
      if (existentes && !(await UI.confirm(`El folio ${folio} ya tiene ${existentes} clave(s) registradas. ¿Agregar estas claves al mismo folio?`))) return;
      if (!v('#pf_db') && !(await UI.confirm('No hay tiempo de entrega: las claves se guardarán sin fecha estimada. ¿Continuar?'))) return;

      const now = new Date();
      const fecha = `${v('#pf_fecha')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const baseRow = {
        modulo: mod, tipo_solicitud: st.tipo, anio: +v('#pf_fecha').slice(0, 4), mes: U.MESES[+v('#pf_fecha').slice(5, 7) - 1],
        solicitante: U.norm(v('#pf_solicitante')), area: U.norm(v('#pf_area')),
        proveedor: U.norm(v('#pf_proveedor')) || null, tipo_material: mod !== 'SOBREPEDIDO' ? (U.norm(v('#pf_material')) || null) : null,
        folio_pedido: folio, id_oc: v('#pf_oc') || null, status_pedido: 'PENDIENTE', estatus_facturacion: 'PENDIENTE',
        directo_sanver: mod === 'ENTREGA_DIRECTA' ? (v('#pf_directo') || null) : null,
        validacion_clasificacion: mod === 'SOBREPEDIDO' ? (v('#pf_clasif') || null) : null,
        comentarios: v('#pf_coment') || null, fecha_solicitud: fecha,
        tiempo_entrega: v('#pf_te') || null, dias_inicio: v('#pf_da') === '' ? null : +v('#pf_da'), dias_fin: v('#pf_db') === '' ? null : +v('#pf_db'),
        tipo_dias: v('#pf_db') ? $('#pf_tipodias').value : null, fecha_estimada_manual: false,
        tiempo_descarga_horas: mod !== 'SOBREPEDIDO' && v('#pf_td') !== '' ? +v('#pf_td') : null,
      };
      const fe = C.fechasEstimadas(baseRow, S.hol);
      baseRow.fecha_estimada_inicio = fe.inicio; baseRow.fecha_estimada = fe.fin;
      const rows = lineas.map((l) => ({
        ...baseRow, comprador: C.compradorDeLinea(l, st.compModo, general), clave: l.clave || 'NUEVO', descripcion: U.norm(l.descripcion), marca: l.marca || null, unidad: l.unidad || null,
        cantidad_solicitada: Number(l.cantidad), catalogado_nuevo: mod === 'SOBREPEDIDO' ? (l.art ? 'CATALOGADO' : 'NUEVO') : null,
      }));
      const ld = UI.loading('Guardando pedido…');
      try {
        await S.insertPedidos(rows);
        UI.toast(`Pedido ${folio} guardado con ${rows.length} clave(s)`);
        m.close();
      } catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
    };

    aplicarModo(); adapt();
  };
})();
