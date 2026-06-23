const XLSX = require('xlsx');

const SHARE_URL = 'https://cenabr-my.sharepoint.com/:x:/g/personal/marcelo_sousa_cenabr_com_br/IQCVeLis-mYmT6cqLC_3g-4dAV5C2uiWt_SYZCXAbSXrp74?e=Jxw7uN&download=1';
const SHEET_NAME = 'CONTROLE_GERAL';
const CACHE_TTL_MS = 5 * 60 * 1000;

const DATE_COLUMNS = new Set([
  'DATA_DE_ENVIO', 'DATA_DA_VIAB.', 'PROJ_DATA_ENVIO',
  'PROG_INICIO PREV', 'PRO_INICIO REAL', 'PRO_FIM PREV', 'PRO_FIM REAL',
  'MED_DATA_ENVIADA', 'ENCER_DATA_ENVIO',
]);

let cache = { data: null, timestamp: 0 };

function excelDateToISO(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function fetchWorkbookBuffer() {
  const res1 = await fetch(SHARE_URL, { redirect: 'manual' });
  if (res1.status !== 302 && res1.status !== 301) {
    throw new Error(`Resposta inesperada do SharePoint (status ${res1.status})`);
  }
  const location = res1.headers.get('location');
  const setCookie = res1.headers.get('set-cookie');
  if (!location) throw new Error('SharePoint não retornou redirecionamento.');
  const nextUrl = location.startsWith('http') ? location : new URL(location, 'https://cenabr-my.sharepoint.com').toString();
  const res2 = await fetch(nextUrl, { headers: setCookie ? { cookie: setCookie.split(';')[0] } : {} });
  if (!res2.ok) throw new Error(`Falha ao baixar arquivo (status ${res2.status})`);
  const buf = await res2.arrayBuffer();
  return Buffer.from(buf);
}

function extractControleGeral(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Aba ${SHEET_NAME} não encontrada no arquivo.`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIndex = rows.findIndex((row) => Array.isArray(row) && row[0] === 'NOTA');
  if (headerIndex === -1) return [];
  const headers = rows[headerIndex];

  return rows.slice(headerIndex + 1)
    .filter((row) => row[0])
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        if (!header) return;
        let value = row[index];
        if (value === undefined) value = '';
        if (DATE_COLUMNS.has(header)) {
          value = excelDateToISO(value);
        }
        obj[header] = value;
      });
      return obj;
    });
}

module.exports = async (req, res) => {
  try {
    const now = Date.now();
    const forceRefresh = req.query && req.query.refresh === '1';
    if (!cache.data || forceRefresh || now - cache.timestamp > CACHE_TTL_MS) {
      const buffer = await fetchWorkbookBuffer();
      cache = { data: extractControleGeral(buffer), timestamp: now };
    }
    res.setHeader('Cache-Control', 'private, s-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ rows: cache.data, count: cache.data.length, updatedAt: cache.timestamp });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Falha ao carregar CONTROLE_GERAL.' });
  }
};
