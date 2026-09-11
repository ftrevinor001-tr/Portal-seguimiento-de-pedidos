/* Lectura y escritura de Excel (.xlsx) y CSV sin dependencias externas (usa JSZip incluido en vendor/). */
(function (root) {
  const XL = {};
  const JSZipRef = () => root.JSZip || (typeof require !== 'undefined' ? require('./vendor/jszip.min.js') : null);

  const xmlEsc = (s) => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const xmlUnesc = (s) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (m, e) =>
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : e === 'amp' ? '&' :
      e[1] === 'x' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(parseInt(e.slice(1), 10)));
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIndex = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const EPOCH = Date.UTC(1899, 11, 30);
  const pad = (n) => String(n).padStart(2, '0');

  function serialToIso(v, withTime) {
    const ms = Math.round(v * 86400000);
    const d = new Date(EPOCH + ms);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (!withTime) return date;
    return `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  function isoToSerial(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return (t - EPOCH) / 86400000;
  }

  /* ------------------------------ ESCRITURA ------------------------------ */
  /** sheets: [{ name, columns:[{header, key, type:'text'|'number'|'date'|'datetime'|'money'|'pct', width}], rows:[obj] }] */
  XL.build = async function (sheets) {
    const JSZip = JSZipRef();
    const zip = new JSZip();
    const names = [];
    sheets.forEach((sh, i) => {
      let n = String(sh.name || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
      while (names.includes(n)) n = n.slice(0, 28) + '_' + i;
      names.push(n);
    });
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    // estilos: 0 normal, 1 encabezado, 2 fecha, 3 fecha-hora, 4 moneda, 5 porcentaje, 6 número con decimales
    zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="166" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="167" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC2560F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);

    sheets.forEach((sh, si) => {
      const cols = sh.columns;
      const parts = [];
      parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${colName(Math.max(0, cols.length - 1))}${sh.rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>`);
      cols.forEach((c, i) => parts.push(`<col min="${i + 1}" max="${i + 1}" width="${c.width || Math.min(45, Math.max(10, String(c.header).length + 2))}" customWidth="1"/>`));
      parts.push('</cols><sheetData>');
      parts.push(`<row r="1">${cols.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${xmlEsc(c.header)}</t></is></c>`).join('')}</row>`);
      sh.rows.forEach((row, ri) => {
        const r = ri + 2;
        let cells = '';
        cols.forEach((c, i) => {
          let v = typeof c.value === 'function' ? c.value(row) : row[c.key];
          if (v === null || v === undefined || v === '') return;
          const ref = `${colName(i)}${r}`;
          const t = c.type || 'text';
          if ((t === 'date' || t === 'datetime')) {
            const s = isoToSerial(v);
            if (s !== null) { cells += `<c r="${ref}" s="${t === 'date' ? 2 : 3}"><v>${t === 'date' ? Math.floor(s) : s}</v></c>`; return; }
          }
          if ((t === 'number' || t === 'money' || t === 'pct') && v !== '' && !isNaN(v)) {
            cells += `<c r="${ref}"${t === 'money' ? ' s="4"' : t === 'pct' ? ' s="5"' : ''}><v>${Number(v)}</v></c>`; return;
          }
          if (typeof v === 'boolean') { cells += `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`; return; }
          cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        });
        parts.push(`<row r="${r}">${cells}</row>`);
      });
      parts.push('</sheetData>');
      if (sh.rows.length && cols.length) parts.push(`<autoFilter ref="A1:${colName(cols.length - 1)}${sh.rows.length + 1}"/>`);
      parts.push('</worksheet>');
      zip.file(`xl/worksheets/sheet${si + 1}.xml`, parts.join(''));
    });
    return zip.generateAsync({ type: typeof Blob !== 'undefined' && typeof window !== 'undefined' ? 'blob' : 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  XL.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };
  XL.exportar = async function (sheets, filename) { XL.download(await XL.build(sheets), filename); };

  /* ------------------------------ LECTURA ------------------------------ */
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
  const BUILTIN_DATETIME = new Set([22]);
  function formatIsDate(code) {
    const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    return /[dy]/i.test(c) || (/m/i.test(c) && !/[h]/i.test(c) && /[\/\-.]/.test(c));
  }

  /** Lee un .xlsx. Devuelve { sheetNames:[...], sheet(name) -> array de filas (arrays) } */
  XL.read = async function (data, { onlySheets } = {}) {
    const JSZip = JSZipRef();
    const zip = await JSZip.loadAsync(data);
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const rels = {};
    for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = (m[1].match(/\bId="([^"]+)"/) || [])[1], target = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
      if (id && target) rels[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    }
    const sheetsMeta = [];
    for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const name = xmlUnesc((m[1].match(/\bname="([^"]*)"/) || [])[1] || '');
      const rid = (m[1].match(/\br:id="([^"]+)"/) || m[1].match(/\bid="([^"]+)"/) || [])[1];
      sheetsMeta.push({ name, path: 'xl/' + rels[rid] });
    }
    // shared strings
    let shared = [];
    const ssFile = zip.file('xl/sharedStrings.xml');
    if (ssFile) {
      const ss = await ssFile.async('string');
      for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
        let txt = '';
        for (const t of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) txt += t[1];
        if (/<rPh/.test(m[1])) { txt = ''; for (const t of m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) txt += t[1]; }
        shared.push(xmlUnesc(txt));
      }
    }
    // estilos de fecha
    const dateStyles = new Map(); // xf index -> 'date' | 'datetime'
    const stFile = zip.file('xl/styles.xml');
    if (stFile) {
      const st = await stFile.async('string');
      const fmts = {};
      for (const m of st.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) fmts[+m[1]] = xmlUnesc(m[2]);
      const cellXfs = (st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
      let i = 0;
      for (const m of cellXfs.matchAll(/<xf\b([^>]*)(?:\/>|>)/g)) {
        const id = +((m[1].match(/numFmtId="(\d+)"/) || [])[1] || 0);
        const code = fmts[id];
        if (BUILTIN_DATE.has(id) || (code && formatIsDate(code))) {
          dateStyles.set(i, (BUILTIN_DATETIME.has(id) || (code && /h/i.test(code))) ? 'datetime' : 'date');
        }
        i++;
      }
    }
    const cache = {};
    const out = {
      sheetNames: sheetsMeta.map((s) => s.name),
      async rows(name) {
        if (cache[name]) return cache[name];
        const meta = sheetsMeta.find((s) => s.name === name);
        if (!meta || !zip.file(meta.path)) return [];
        const xml = await zip.file(meta.path).async('string');
        const rows = [];
        const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
        let rm, rowIdx = 0;
        while ((rm = rowRe.exec(xml))) {
          const rAttr = rm[1].match(/\br="(\d+)"/);
          rowIdx = rAttr ? +rAttr[1] - 1 : rowIdx;
          const arr = [];
          if (rm[2]) {
            const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
            let cm, ci = 0;
            while ((cm = cellRe.exec(rm[2]))) {
              const attrs = cm[1];
              const ref = attrs.match(/\br="([A-Z]+)\d+"/);
              ci = ref ? colIndex(ref[1]) : ci;
              const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
              const s = +((attrs.match(/\bs="(\d+)"/) || [])[1] || 0);
              const body = cm[2] || '';
              let v = null;
              const vm = body.match(/<v>([\s\S]*?)<\/v>/);
              if (t === 's') v = vm ? shared[+vm[1]] : null;
              else if (t === 'inlineStr') { let txt = ''; for (const tt of body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) txt += tt[1]; v = xmlUnesc(txt); }
              else if (t === 'str' || t === 'e') v = vm ? xmlUnesc(vm[1]) : null;
              else if (t === 'b') v = vm ? vm[1] === '1' : null;
              else if (vm) {
                const num = Number(vm[1]);
                const ds = dateStyles.get(s);
                v = ds ? serialToIso(num, ds === 'datetime' && num % 1 !== 0) : num;
              }
              arr[ci] = v;
              ci++;
            }
          }
          rows[rowIdx] = arr;
          rowIdx++;
        }
        for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
        cache[name] = rows;
        return rows;
      },
    };
    return out;
  };

  /** Filas (arrays) -> objetos usando la primera fila como encabezados */
  XL.toObjects = function (rows, { headerRow = 0 } = {}) {
    const hdr = (rows[headerRow] || []).map((h) => (h === null || h === undefined) ? '' : String(h).trim());
    const out = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r.some((v) => v !== null && v !== undefined && v !== '')) continue;
      const o = {}; hdr.forEach((h, j) => { if (h) o[h] = r[j] === undefined ? null : r[j]; }); out.push(o);
    }
    return { headers: hdr, rows: out };
  };

  /** CSV (coma, punto y coma o tabulador) -> filas */
  XL.parseCSV = function (text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim() === '' ? null : c.trim()));
  };
  XL.toCSV = (headers, rows) => '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => { const s = c === null || c === undefined ? '' : String(c); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');

  /** Lee archivo (File) Excel o CSV y devuelve {sheetNames, rows(name)} */
  XL.readFile = async function (file) {
    if (/\.csv$|\.txt$/i.test(file.name)) {
      const rows = XL.parseCSV(await file.text());
      return { sheetNames: ['CSV'], rows: async () => rows };
    }
    return XL.read(await file.arrayBuffer());
  };

  XL._serialToIso = serialToIso; XL._isoToSerial = isoToSerial;
  root.XL = XL;
  if (typeof module !== 'undefined') module.exports = XL;
})(typeof window !== 'undefined' ? window : globalThis);
