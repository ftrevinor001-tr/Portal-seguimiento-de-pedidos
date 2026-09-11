/* Utilidades generales: fechas (siempre como texto ISO 'AAAA-MM-DD'), formato y DOM */
(function (root) {
  const U = {};
  U.MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  U.MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  U.DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

  const pad = (n) => String(n).padStart(2, '0');

  /** Normaliza cualquier fecha a 'AAAA-MM-DD' (o null). Acepta Date, 'AAAA-MM-DD...', 'DD/MM/AAAA'. */
  U.iso = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return null;
  };
  /** 'AAAA-MM-DDTHH:MM:SS' conservando hora si existe */
  U.isoDateTime = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return `${U.iso(v)}T${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
    const s = String(v).trim();
    // Con zona horaria (timestamptz de Supabase): convertir a hora local
    if (/[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(s)) { const d = new Date(s.replace(' ', 'T')); if (!isNaN(d)) return U.isoDateTime(d); }
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}`;
    const d = U.iso(s);
    return d ? `${d}T00:00:00` : null;
  };
  U.today = () => U.iso(new Date());
  const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromUTC = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  U.addDays = (iso, n) => fromUTC(toUTC(iso) + n * 86400000);
  U.diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000); // a - b
  U.weekday = (iso) => new Date(toUTC(iso)).getUTCDay(); // 0 = domingo
  U.isBusiness = (iso, hol) => { const w = U.weekday(iso); return w !== 0 && w !== 6 && !(hol && hol.has(iso)); };
  /** Igual que WORKDAY de Excel: n-ésimo día hábil (L-V, sin inhábiles) después de la fecha */
  U.addWorkdays = function (iso, n, hol) {
    let d = iso, c = 0;
    if (n <= 0) return iso;
    while (c < n) { d = U.addDays(d, 1); if (U.isBusiness(d, hol)) c++; }
    return d;
  };
  /** Igual que NETWORKDAYS: días hábiles entre a y b, incluyendo ambos extremos */
  U.networkdays = function (a, b, hol) {
    if (a > b) return -U.networkdays(b, a, hol);
    let c = 0, d = a, guard = 0;
    while (d <= b && guard++ < 5000) { if (U.isBusiness(d, hol)) c++; d = U.addDays(d, 1); }
    return c;
  };
  U.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
  U.monthStart = (y, m) => `${y}-${pad(m)}-01`;
  U.monthEnd = (y, m) => `${y}-${pad(m)}-${pad(U.daysInMonth(y, m))}`;

  U.fmtDate = (v) => { const d = U.iso(v); if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  U.fmtDateTime = (v) => { const s = U.isoDateTime(v); if (!s) return ''; return `${U.fmtDate(s)} ${s.slice(11, 16)}`; };
  U.fmtNum = (v, dec = 0) => (v === null || v === undefined || v === '' || isNaN(v)) ? '' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  U.fmtNumAuto = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? '' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  U.fmtMoney = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? '' : Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
  U.fmtPct = (v, dec = 1) => (v === null || v === undefined || isNaN(v)) ? '—' : `${(v * 100).toFixed(dec)}%`;
  U.esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  U.blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  U.uniq = (arr) => [...new Set(arr.filter((x) => !U.blank(x)))];
  U.sortEs = (arr) => arr.slice().sort((a, b) => String(a).localeCompare(String(b), 'es'));
  U.groupBy = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  U.sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn ? fn(x) : x) || 0), 0);
  U.chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---- DOM helpers (solo navegador) ----
  U.$ = (sel, el) => (el || document).querySelector(sel);
  U.$$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  U.h = function (html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  U.options = (values, selected, { empty } = {}) =>
    (empty !== undefined ? `<option value="">${U.esc(empty)}</option>` : '') +
    values.map((v) => { const val = typeof v === 'object' ? v.value : v; const lab = typeof v === 'object' ? v.label : v; return `<option value="${U.esc(val)}"${String(val) === String(selected ?? '') ? ' selected' : ''}>${U.esc(lab)}</option>`; }).join('');

  root.U = U;
  if (typeof module !== 'undefined') module.exports = U;
})(typeof window !== 'undefined' ? window : globalThis);
