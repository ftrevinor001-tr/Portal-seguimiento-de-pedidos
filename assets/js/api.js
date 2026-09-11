/* Cliente mínimo para la API REST de Supabase (PostgREST). Sin librerías externas. */
(function (root) {
  const API = {};
  let BASE = '', KEY = '', sendBearer = true;

  API.init = function (url, key) {
    BASE = String(url || '').replace(/\/+$/, '') + '/rest/v1';
    KEY = key || '';
    // Llaves nuevas (sb_publishable_...) no son JWT: se mandan solo en "apikey"
    sendBearer = !/^sb_/.test(KEY);
  };
  API.configurada = () => !!BASE && !!KEY && !/PEGAR_AQUI/.test(KEY);

  function headers(extra) {
    const h = { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (sendBearer) h.Authorization = `Bearer ${KEY}`;
    return Object.assign(h, extra || {});
  }

  const enc = (v) => encodeURIComponent(v);
  function quoteIn(v) { const s = String(v); return /[,()"\s]/.test(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s; }
  /** filters: [['col','eq',valor], ['col','in',[...]], ['col','is','null']] */
  function qs({ select, filters, order, limit, offset, onConflict } = {}) {
    const p = [];
    if (select) p.push(`select=${enc(select)}`);
    for (const [col, op, val] of filters || []) {
      if (op === 'in') p.push(`${enc(col)}=in.(${val.map(quoteIn).map(enc).join(',')})`);
      else p.push(`${enc(col)}=${op}.${enc(val)}`);
    }
    if (order) p.push(`order=${enc(order)}`);
    if (limit !== undefined) p.push(`limit=${limit}`);
    if (offset) p.push(`offset=${offset}`);
    if (onConflict) p.push(`on_conflict=${enc(onConflict)}`);
    return p.length ? '?' + p.join('&') : '';
  }

  async function request(method, path, { body, prefer, query } = {}, retry = true) {
    const extra = {};
    if (prefer) extra.Prefer = prefer;
    let res;
    try {
      res = await fetch(`${BASE}/${path}${qs(query)}`, { method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error('No hay conexión con la base de datos (Supabase). Revisa tu internet o la URL en config.js.');
    }
    if (res.status === 401 && retry) { sendBearer = !sendBearer; return request(method, path, { body, prefer, query }, false); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data && (data.message || data.error_description || data.error || data.hint) || `Error ${res.status}`;
      const err = new Error(traducir(msg, data));
      err.status = res.status; err.detail = data;
      throw err;
    }
    return { data, count: parseCount(res.headers.get('content-range')) };
  }
  function parseCount(cr) { if (!cr) return null; const m = cr.match(/\/(\d+|\*)$/); return m && m[1] !== '*' ? +m[1] : null; }
  function traducir(msg, data) {
    if (/relation .* does not exist|Could not find the table/i.test(msg)) return 'Las tablas no existen en Supabase. Ejecuta supabase/schema.sql en el SQL Editor.';
    const col = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
    if (col) return `Falta la columna “${col[1]}” en la tabla ${col[2]} de Supabase. Ejecuta supabase/schema.sql (o el SQL de la actualización) en el SQL Editor y vuelve a intentar.`;
    if (/Invalid API key|No API key|JWT/i.test(msg)) return 'La llave de Supabase en config.js no es válida.';
    if (/duplicate key/i.test(msg)) return 'Ya existe un registro con esos mismos datos (valor duplicado).';
    if (/permission denied/i.test(msg)) return 'Permiso denegado por la base de datos: ' + msg;
    return msg + (data && data.details ? ` (${data.details})` : '');
  }

  API.select = async (table, query) => (await request('GET', table, { query })).data;
  API.count = async (table, filters, col = 'id') => (await request('GET', table, { query: { select: col, filters, limit: 1 }, prefer: 'count=exact' })).count;
  /** Trae todas las filas paginando de 1000 en 1000 */
  API.selectAll = async function (table, query = {}, onProgress) {
    const page = 1000; let offset = 0; const out = [];
    for (;;) {
      const rows = await API.select(table, { ...query, limit: page, offset });
      out.push(...rows);
      if (onProgress) onProgress(out.length);
      if (rows.length < page) break;
      offset += page;
    }
    return out;
  };
  API.insert = async function (table, rows, { chunk = 500, returning = true, onProgress } = {}) {
    const list = Array.isArray(rows) ? rows : [rows];
    const out = [];
    for (let i = 0; i < list.length; i += chunk) {
      const part = list.slice(i, i + chunk);
      const r = await request('POST', table, { body: part, prefer: returning ? 'return=representation' : 'return=minimal' });
      if (returning && r.data) out.push(...r.data);
      if (onProgress) onProgress(Math.min(i + chunk, list.length), list.length);
    }
    return out;
  };
  API.upsert = async function (table, rows, onConflict, { chunk = 1000, onProgress } = {}) {
    for (let i = 0; i < rows.length; i += chunk) {
      await request('POST', table, { body: rows.slice(i, i + chunk), prefer: 'resolution=merge-duplicates,return=minimal', query: { onConflict } });
      if (onProgress) onProgress(Math.min(i + chunk, rows.length), rows.length);
    }
  };
  API.update = async function (table, filters, patch) {
    const r = await request('PATCH', table, { body: patch, prefer: 'return=representation', query: { filters } });
    return r.data;
  };
  API.updateById = async (table, id, patch) => (await API.update(table, [['id', 'eq', id]], patch))[0];

  root.API = API;
})(window);
