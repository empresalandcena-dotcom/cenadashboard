/* ═══════════════════════════════════════════════════════
   PROGRAMAÇÃO — dados ao vivo (aba "PROGRAMAÇÃO" da planilha publicada)
   Depende de globais definidos no <script> inline do cena_dashboard_v2.html:
   setText, setHTML, fmtNumber, parseDateBR, formatDateLabel, formatMonthLabel,
   titleCase, getMonthName, buildSelectOptions, mkChart, axCfg, rebuildCharts.
═══════════════════════════════════════════════════════ */

const PROG_DATA_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTE2IBM9w4xK0zGo1A4alA0fVM6uIcK7KShcFoTN93348ssJsLJ9ZaVtjRnnhtx7wLTM6n_-rvOKKij/pub?gid=2009110587&single=true&output=csv';

let progRows = [];
let progLastRows = [];
let progFiltersBound = false;
const progState = {
  mode: 'week',
  periodKey: '',
  year: 'all',
  month: 'all',
  team: 'all',
  supervisor: 'all',
  city: 'all',
  status: 'all',
  blockFilter: 'all',
  nota: '',
};

const progTableFilters = {
  cidade: 'all',
  equipe: 'all',
  supervisor: 'all',
  statusSap: 'all',
  statusFis: 'all',
  bloqueio: 'all',
};
let progTableFiltersBound = false;

function progNormalizeStatus(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v.includes('EXPURGO')) return 'expurgo';
  if (v.includes('CANCEL')) return 'cancelada';
  if (v.includes('REPROG')) return 'reprogramada';
  if (v.includes('CONCLU')) return 'concluida';
  return 'programada';
}

function progParseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const cleaned = String(value).replace(/[^\d,.-]/g, '');
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function progIsBlocked(row) {
  const a = String(row.blokPd || '').trim().toUpperCase();
  const b = String(row.statusBlokPd || '').trim().toUpperCase();
  if (!a && !b) return false;
  return (!!a && a !== 'LIVRE') || (!!b && b !== 'LIVRE');
}

function extractProgRows(parsedRows) {
  const headerIndex = parsedRows.findIndex((row) => Array.isArray(row) && row.includes('EQUIPE') && row.includes('Status Fis'));
  if (headerIndex === -1) return [];
  const headers = parsedRows[headerIndex];
  const dataRows = parsedRows.slice(headerIndex + 1);

  return dataRows
    .map((row) => {
      const mapped = {};
      headers.forEach((header, index) => { mapped[header] = row[index]; });
      return mapped;
    })
    .filter((row) => row['EQUIPE'])
    .map((row) => ({
      supervisor: row['SUPERVISOR'] || 'Sem supervisor',
      statusSap: row['Status SAP'] || 'Sem status',
      statusFis: row['Status Fis'] || '',
      statusKey: progNormalizeStatus(row['Status Fis']),
      notaProj: row['Nota Proj'] || '',
      pep: row['PEP'] || '',
      cidade: row['Cidade'] || 'Sem cidade',
      equipe: row['EQUIPE'] || 'Sem equipe',
      blokPd: row['BLOK/PD'] || '',
      statusBlokPd: row['STATUS_BLOK/PD'] || '',
      execDate: parseDateBR(row['Data de Execução da Programação']),
      valorObra: progParseMoney(row['Valor da Obra']),
      valorPrev: progParseMoney(row['Valor de serviços prev. (R$)']),
      valorReal: progParseMoney(row['Valor de serviços real por dia (R$)']),
      postes: parseInteger(row['PST']),
      numProgramacao: parseInteger(row['Número de Programação para essa data']),
      progNecessaria: parseInteger(row['Programação Necessária para Conclusão']),
    }))
    .map((row) => ({ ...row, bloqueada: progIsBlocked(row) }));
}

function progHasValidDate(row) {
  return row.execDate instanceof Date && !Number.isNaN(row.execDate.getTime());
}

function progRowYear(row) {
  return progHasValidDate(row) ? row.execDate.getFullYear() : null;
}

function progRowMonth(row) {
  return progHasValidDate(row) ? row.execDate.getMonth() + 1 : null;
}

function progGetWeekNumber(date) {
  const firstJan = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - firstJan) / 86400000);
  return Math.ceil((days + firstJan.getDay() + 1) / 7);
}

function progPeriodInfo(row, mode) {
  const date = row.execDate;
  if (!progHasValidDate(row)) {
    return { key: null, label: 'Sem data de execução', order: -Infinity };
  }
  if (mode === 'day') {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { key, label: formatDateLabel(date), order: date.getTime() };
  }
  if (mode === 'month') {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: formatMonthLabel(date), order: Number(key.replace('-', '')) };
  }
  const week = progGetWeekNumber(date);
  const year = date.getFullYear();
  return { key: `${year}-W${String(week).padStart(2, '0')}`, label: `S${String(week).padStart(2, '0')}/${year}`, order: year * 100 + week };
}

function progGetPeriodOptions(rows, mode) {
  const map = new Map();
  rows.forEach((row) => {
    const info = progPeriodInfo(row, mode);
    if (info.key === null) return;
    if (!map.has(info.key)) map.set(info.key, info);
  });
  return Array.from(map.values()).sort((a, b) => b.order - a.order);
}

function progGetPeriodRows(rows, mode, periodKey) {
  if (!periodKey) return rows;
  return rows.filter((row) => progPeriodInfo(row, mode).key === periodKey);
}

function progUniqueValues(rows, field) {
  return Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function progUpdateFilterControls() {
  const yearOptions = Array.from(new Set(progRows.map(progRowYear).filter((year) => year !== null))).sort((a, b) => b - a);
  if (progState.year !== 'all' && !yearOptions.includes(Number(progState.year))) progState.year = 'all';

  const rowsByYear = progRows.filter((row) => progState.year === 'all' || progRowYear(row) === Number(progState.year));
  const monthOptions = Array.from(new Set(rowsByYear.map(progRowMonth).filter((month) => month !== null))).sort((a, b) => a - b);
  if (progState.month !== 'all' && !monthOptions.includes(Number(progState.month))) progState.month = 'all';

  const rowsByMonth = rowsByYear.filter((row) => progState.month === 'all' || progRowMonth(row) === Number(progState.month));
  const periodOptions = progGetPeriodOptions(rowsByMonth, progState.mode);
  if (!periodOptions.some((option) => option.key === progState.periodKey)) progState.periodKey = '';

  const periodRows = progGetPeriodRows(rowsByMonth, progState.mode, progState.periodKey);

  const teamOptions = progUniqueValues(periodRows, 'equipe').map((value) => ({ value, label: value }));
  if (progState.team !== 'all' && !teamOptions.some((option) => option.value === progState.team)) progState.team = 'all';

  const supervisorBase = progState.team === 'all' ? periodRows : periodRows.filter((row) => row.equipe === progState.team);
  const supervisorOptions = progUniqueValues(supervisorBase, 'supervisor').map((value) => ({ value, label: titleCase(value) }));
  if (progState.supervisor !== 'all' && !supervisorOptions.some((option) => option.value === progState.supervisor)) progState.supervisor = 'all';

  const cityBase = progState.supervisor === 'all' ? supervisorBase : supervisorBase.filter((row) => row.supervisor === progState.supervisor);
  const cityOptions = progUniqueValues(cityBase, 'cidade').map((value) => ({ value, label: titleCase(value) }));
  if (progState.city !== 'all' && !cityOptions.some((option) => option.value === progState.city)) progState.city = 'all';

  const statusOptions = [
    { value: 'concluida', label: 'Concluída' },
    { value: 'programada', label: 'Programada' },
    { value: 'reprogramada', label: 'Reprogramada' },
    { value: 'cancelada', label: 'Cancelada' },
    { value: 'expurgo', label: 'Expurgo' },
  ];

  buildSelectOptions('prog-year-select', yearOptions.map((value) => ({ value: String(value), label: String(value) })), progState.year, 'Todos os anos');
  buildSelectOptions('prog-month-select', monthOptions.map((value) => ({ value: String(value), label: getMonthName(value) })), progState.month, 'Todos os meses');
  buildSelectOptions(
    'prog-period-select',
    periodOptions.map((option) => ({ value: option.key, label: option.label })),
    progState.periodKey,
    progState.mode === 'day' ? 'Todos os dias' : progState.mode === 'month' ? 'Todos os meses' : 'Todas as semanas'
  );
  buildSelectOptions('prog-team-select', teamOptions, progState.team, 'Todas as equipes');
  buildSelectOptions('prog-supervisor-select', supervisorOptions, progState.supervisor, 'Todos os supervisores');
  buildSelectOptions('prog-city-select', cityOptions, progState.city, 'Todas as cidades');
  buildSelectOptions('prog-status-select', statusOptions, progState.status, 'Todos os status');

  document.querySelectorAll('#prog-mode-seg .seg-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.mode === progState.mode));
  document.querySelectorAll('#prog-block-seg .seg-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.block === progState.blockFilter));

  const periodSelect = document.getElementById('prog-period-select');
  setText('prog-breadcrumb-period', periodSelect?.selectedOptions?.[0]?.textContent || 'Programação');
  setText('prog-period-range', progFormatPeriodRange(periodRows));
}

function progFormatPeriodRange(rows) {
  const dated = rows.filter(progHasValidDate);
  if (!dated.length) return '';
  const dates = dated.map((row) => row.execDate.getTime());
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  if (min.getTime() === max.getTime()) return `(${formatDateLabel(min)})`;
  return `(de ${formatDateLabel(min)} até ${formatDateLabel(max)})`;
}

function progGetFilteredRows() {
  const rowsByYear = progRows.filter((row) => progState.year === 'all' || progRowYear(row) === Number(progState.year));
  const rowsByMonth = rowsByYear.filter((row) => progState.month === 'all' || progRowMonth(row) === Number(progState.month));
  const periodRows = progGetPeriodRows(rowsByMonth, progState.mode, progState.periodKey);
  return periodRows.filter((row) => {
    if (progState.team !== 'all' && row.equipe !== progState.team) return false;
    if (progState.supervisor !== 'all' && row.supervisor !== progState.supervisor) return false;
    if (progState.city !== 'all' && row.cidade !== progState.city) return false;
    if (progState.status !== 'all' && row.statusKey !== progState.status) return false;
    if (progState.blockFilter === 'blocked' && !row.bloqueada) return false;
    if (progState.nota) {
      const query = progState.nota.trim().toLowerCase();
      const haystack = `${row.notaProj} ${row.pep}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
    }
    return true;
  });
}

function progBuildStatusBreakdown(rows) {
  const counts = { concluida: 0, programada: 0, reprogramada: 0, cancelada: 0, expurgo: 0 };
  rows.forEach((row) => { counts[row.statusKey] = (counts[row.statusKey] || 0) + 1; });
  return counts;
}

function progRenderKpis(rows) {
  const total = rows.length;
  const counts = progBuildStatusBreakdown(rows);
  const bloqueadas = rows.filter((row) => row.bloqueada).length;
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  setText('prog-kpi-concluidas', fmtNumber(counts.concluida));
  setHTML('prog-kpi-concluidas-sub', `<i class="ti ti-arrow-up-right" style="font-size:11px"></i>${pct(counts.concluida)}% do total`);
  setText('prog-kpi-programadas', fmtNumber(counts.programada));
  setText('prog-kpi-reprogramadas', fmtNumber(counts.reprogramada));
  setText('prog-kpi-canceladas', fmtNumber(counts.cancelada));
  setHTML('prog-kpi-canceladas-sub', `<i class="ti ti-x" style="font-size:11px"></i>${pct(counts.cancelada)}% do total`);
  setText('prog-kpi-expurgo', fmtNumber(counts.expurgo));
  setText('prog-kpi-bloqueadas', fmtNumber(bloqueadas));

  const valorObra = rows.reduce((sum, row) => sum + row.valorObra, 0);
  const valorPrev = rows.reduce((sum, row) => sum + row.valorPrev, 0);
  const valorReal = rows.reduce((sum, row) => sum + row.valorReal, 0);
  setText('prog-kpi-valor-obra', fmtCurrencyExact(valorObra));
  setText('prog-kpi-valor-prev', fmtCurrencyExact(valorPrev));
  setText('prog-kpi-valor-real', fmtCurrencyExact(valorReal));
}

function progTopBy(rows, field, limit) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row[field] || 'Não informado';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function progRenderFunnel(rows) {
  const container = document.getElementById('prog-funnel-rows');
  if (!container) return;
  const map = new Map();
  rows.forEach((row) => {
    const key = row.statusSap || 'Sem status';
    map.set(key, (map.get(key) || 0) + 1);
  });
  const entries = Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const max = entries[0]?.value || 1;
  const colors = ['var(--green)', 'var(--blue)', 'var(--yellow)', 'var(--purple)', 'var(--t3)', 'var(--red)'];

  container.innerHTML = entries.length
    ? entries.map((entry, index) => {
        const pct = Math.max(2, Math.round((entry.value / max) * 100));
        const color = colors[index % colors.length];
        const tooltip = `${entry.label}: ${fmtNumber(entry.value)} registros`;
        return `<div class="fr" title="${tooltip}"><div class="fl">${entry.label}</div><div class="ft"><div class="ff" style="width:${pct}%;background:${color}" title="${tooltip}"></div></div><div class="fn">${fmtNumber(entry.value)}</div></div>`;
      }).join('')
    : '<div style="color:var(--t2);font-size:11px">Sem dados para os filtros atuais.</div>';

  setText('prog-funnel-subtitle', `${fmtNumber(rows.length)} registros`);
}

window.renderProgramacaoCharts = function renderProgramacaoCharts(C) {
  const rows = progLastRows;
  const counts = progBuildStatusBreakdown(rows);
  const total = rows.length;

  setHTML('prog-donut-legend', `
    <div class="leg-item"><div class="leg-sq" style="background:${C.green}"></div>Concluídas (${fmtNumber(counts.concluida)})</div>
    <div class="leg-item"><div class="leg-sq" style="background:${C.blue}"></div>Programadas (${fmtNumber(counts.programada)})</div>
    <div class="leg-item"><div class="leg-sq" style="background:${C.red}"></div>Canceladas (${fmtNumber(counts.cancelada)})</div>
    <div class="leg-item"><div class="leg-sq" style="background:${C.yellow}"></div>Reprogramadas (${fmtNumber(counts.reprogramada)})</div>
    <div class="leg-item"><div class="leg-sq" style="background:${C.cyan}"></div>Expurgo (${fmtNumber(counts.expurgo)})</div>
  `);
  setText('prog-donut-subtitle', `Total: ${fmtNumber(total)} registros`);

  mkChart('ch5', {
    type: 'doughnut',
    data: {
      labels: ['Concluídas', 'Programadas', 'Canceladas', 'Reprogramadas', 'Expurgo'],
      datasets: [{
        data: [counts.concluida, counts.programada, counts.cancelada, counts.reprogramada, counts.expurgo],
        backgroundColor: [C.green, C.blue, C.red, C.yellow, C.cyan],
        borderWidth: 2, borderColor: C.bg,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      plugins: { legend: { display: false } },
      cutout: '68%',
    },
  });

  const topTeams = progTopBy(rows, 'equipe', 10);
  setText('prog-bar-subtitle', `Total: ${fmtNumber(total)} registros`);
  mkChart('ch6', {
    type: 'bar',
    data: { labels: topTeams.map((t) => t.label), datasets: [{ data: topTeams.map((t) => t.value), backgroundColor: C.blue, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      plugins: { legend: { display: false } },
      indexAxis: 'y',
      scales: { x: axCfg(C), y: { ...axCfg(C), grid: { display: false } } },
    },
  });

  const topCities = progTopBy(rows, 'cidade', 8);
  setText('prog-city-chart-subtitle', `Top ${topCities.length} cidades de ${fmtNumber(total)} registros`);
  mkChart('ch9', {
    type: 'bar',
    data: { labels: topCities.map((c) => titleCase(c.label)), datasets: [{ data: topCities.map((c) => c.value), backgroundColor: C.purple, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: false },
        valueLabelPlugin: { enabled: true, color: C.text, fontSize: 10, formatter: (value) => fmtNumber(value) },
      },
      scales: { x: { ...axCfg(C), grid: { display: false }, ticks: { ...axCfg(C).ticks, maxRotation: 35, autoSkip: false } }, y: axCfg(C) },
    },
  });

  progRenderFunnel(rows);

  const statusOrder = ['concluida', 'programada', 'reprogramada', 'cancelada', 'expurgo'];
  const statusLabels = { concluida: 'Concluída', programada: 'Programada', reprogramada: 'Reprogramada', cancelada: 'Cancelada', expurgo: 'Expurgo' };
  const valueByStatus = statusOrder.map((key) => {
    const statusRows = rows.filter((row) => row.statusKey === key);
    return {
      key,
      obra: statusRows.reduce((sum, row) => sum + row.valorObra, 0),
      prev: statusRows.reduce((sum, row) => sum + row.valorPrev, 0),
      real: statusRows.reduce((sum, row) => sum + row.valorReal, 0),
    };
  });
  setText('prog-value-chart-subtitle', `Obra · Previsto · Real, por status · ${fmtNumber(total)} registros`);
  mkChart('ch10', {
    type: 'bar',
    data: {
      labels: statusOrder.map((key) => statusLabels[key]),
      datasets: [
        { label: 'Valor da Obra', data: valueByStatus.map((s) => s.obra), backgroundColor: C.green + 'cc', borderRadius: 2 },
        { label: 'Previsto', data: valueByStatus.map((s) => s.prev), backgroundColor: C.blue + 'cc', borderRadius: 2 },
        { label: 'Real', data: valueByStatus.map((s) => s.real), backgroundColor: C.yellow + 'cc', borderRadius: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: C.tick, font: { family: 'Poppins', size: 10 } } },
        valueLabelPlugin: {
          enabled: true,
          datasetIndexes: [0, 1, 2],
          color: C.text,
          fontSize: 11,
          formatter: (value) => fmtCurrencyCompact(value),
        },
      },
      scales: {
        x: { ...axCfg(C), grid: { display: false } },
        y: { ...axCfg(C), ticks: { ...axCfg(C).ticks, callback: (v) => (v >= 1e6 ? `R$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `R$${(v / 1e3).toFixed(0)}k` : `R$${v}`) } },
      },
    },
  });
};

function progPopulateTableFilters(rows) {
  const cidadeOptions = progUniqueValues(rows, 'cidade').map((value) => ({ value, label: titleCase(value) }));
  if (progTableFilters.cidade !== 'all' && !cidadeOptions.some((o) => o.value === progTableFilters.cidade)) progTableFilters.cidade = 'all';
  buildSelectOptions('prog-col-cidade', cidadeOptions, progTableFilters.cidade, 'Todas');

  const equipeOptions = progUniqueValues(rows, 'equipe').map((value) => ({ value, label: value }));
  if (progTableFilters.equipe !== 'all' && !equipeOptions.some((o) => o.value === progTableFilters.equipe)) progTableFilters.equipe = 'all';
  buildSelectOptions('prog-col-equipe', equipeOptions, progTableFilters.equipe, 'Todas');

  const supervisorOptions = progUniqueValues(rows, 'supervisor').map((value) => ({ value, label: titleCase(value) }));
  if (progTableFilters.supervisor !== 'all' && !supervisorOptions.some((o) => o.value === progTableFilters.supervisor)) progTableFilters.supervisor = 'all';
  buildSelectOptions('prog-col-supervisor', supervisorOptions, progTableFilters.supervisor, 'Todos');

  const statusSapOptions = progUniqueValues(rows, 'statusSap').map((value) => ({ value, label: value }));
  if (progTableFilters.statusSap !== 'all' && !statusSapOptions.some((o) => o.value === progTableFilters.statusSap)) progTableFilters.statusSap = 'all';
  buildSelectOptions('prog-col-statussap', statusSapOptions, progTableFilters.statusSap, 'Todos');

  const statusFisOptions = progUniqueValues(rows, 'statusFis').map((value) => ({ value, label: value }));
  if (progTableFilters.statusFis !== 'all' && !statusFisOptions.some((o) => o.value === progTableFilters.statusFis)) progTableFilters.statusFis = 'all';
  buildSelectOptions('prog-col-statusfis', statusFisOptions, progTableFilters.statusFis, 'Todos');

  const bloqueioEl = document.getElementById('prog-col-bloqueio');
  if (bloqueioEl) bloqueioEl.value = progTableFilters.bloqueio;
}

function progApplyTableFilters(rows) {
  return rows.filter((row) => {
    if (progTableFilters.cidade !== 'all' && row.cidade !== progTableFilters.cidade) return false;
    if (progTableFilters.equipe !== 'all' && row.equipe !== progTableFilters.equipe) return false;
    if (progTableFilters.supervisor !== 'all' && row.supervisor !== progTableFilters.supervisor) return false;
    if (progTableFilters.statusSap !== 'all' && row.statusSap !== progTableFilters.statusSap) return false;
    if (progTableFilters.statusFis !== 'all' && row.statusFis !== progTableFilters.statusFis) return false;
    if (progTableFilters.bloqueio === 'bloqueada' && !row.bloqueada) return false;
    if (progTableFilters.bloqueio === 'livre' && row.bloqueada) return false;
    return true;
  });
}

function progBindTableColumnFilters() {
  if (progTableFiltersBound) return;
  progTableFiltersBound = true;
  const fieldByElementId = {
    'prog-col-cidade': 'cidade',
    'prog-col-equipe': 'equipe',
    'prog-col-supervisor': 'supervisor',
    'prog-col-statussap': 'statusSap',
    'prog-col-statusfis': 'statusFis',
    'prog-col-bloqueio': 'bloqueio',
  };
  Object.entries(fieldByElementId).forEach(([elementId, field]) => {
    document.getElementById(elementId)?.addEventListener('change', (event) => {
      progTableFilters[field] = event.target.value;
      progRenderTable(progLastRows);
    });
  });
}

function progProgressCell(row) {
  const total = row.progNecessaria;
  const current = row.numProgramacao;
  if (!total) return '<span style="color:var(--t3)">—</span>';
  const overflow = current > total;
  const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  const color = overflow ? 'var(--red)' : pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--blue)' : 'var(--yellow)';
  return `<div class="pbwrap"><div class="pb"><div class="pbf" style="width:${pct}%;background:${color}"></div></div><span class="pct" style="color:${color}">${fmtNumber(current)}/${fmtNumber(total)}</span></div>`;
}

function progRenderTable(rows) {
  const tbody = document.getElementById('prog-table-body');
  if (!tbody) return;

  progPopulateTableFilters(rows);
  const columnFiltered = progApplyTableFilters(rows);

  const query = String(document.getElementById('prog-table-search')?.value || '').trim().toLowerCase();
  const filtered = columnFiltered.filter((row) => {
    if (!query) return true;
    return [row.notaProj, row.pep, row.equipe, row.supervisor, row.cidade, row.statusSap, row.statusFis]
      .join(' ').toLowerCase().includes(query);
  });

  setText('prog-table-subtitle', `${fmtNumber(filtered.length)} registros visíveis de ${fmtNumber(rows.length)} filtrados · ${fmtNumber(progRows.length)} na base publicada`);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="color:var(--t2)">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  const visible = filtered.slice(0, 200);
  const rowsHtml = visible.map((row) => {
    const statusClass = row.statusKey === 'concluida' ? 'ok'
      : (row.statusKey === 'cancelada' || row.statusKey === 'expurgo') ? 'no'
      : row.statusKey === 'reprogramada' ? 'wn' : 'bl';
    const blockPill = row.bloqueada ? '<span class="pill no">Bloqueada</span>' : '<span class="pill ok">Livre</span>';
    return `<tr>
      <td style="color:var(--t1);font-weight:500">${row.notaProj || row.pep || '—'}</td>
      <td>${titleCase(row.cidade)}</td>
      <td>${row.equipe}</td>
      <td>${titleCase(row.supervisor)}</td>
      <td>${row.statusSap}</td>
      <td><span class="pill ${statusClass}">${row.statusFis || 'Sem status'}</span></td>
      <td>${row.execDate ? formatDateLabel(row.execDate) : '—'}</td>
      <td>${progProgressCell(row)}</td>
      <td>${fmtNumber(row.postes)}</td>
      <td>${blockPill}</td>
      <td>${fmtCurrencyExact(row.valorObra)}</td>
      <td>${fmtCurrencyExact(row.valorPrev)}</td>
      <td>${fmtCurrencyExact(row.valorReal)}</td>
    </tr>`;
  }).join('');

  const moreNotice = filtered.length > visible.length
    ? `<tr><td colspan="13" style="color:var(--t2);text-align:center">Mostrando ${fmtNumber(visible.length)} de ${fmtNumber(filtered.length)} — refine os filtros para ver mais.</td></tr>`
    : '';

  tbody.innerHTML = rowsHtml + moreNotice;
}

function progGetExportRows() {
  const columnFiltered = progApplyTableFilters(progLastRows);
  const query = String(document.getElementById('prog-table-search')?.value || '').trim().toLowerCase();
  if (!query) return columnFiltered;
  return columnFiltered.filter((row) => [row.notaProj, row.pep, row.equipe, row.supervisor, row.cidade, row.statusSap, row.statusFis]
    .join(' ').toLowerCase().includes(query));
}

function progGetExportBundle() {
  const rows = progLastRows;
  const counts = progBuildStatusBreakdown(rows);
  const bloqueadas = rows.filter((row) => row.bloqueada).length;
  const valorObra = rows.reduce((sum, row) => sum + row.valorObra, 0);
  const valorPrev = rows.reduce((sum, row) => sum + row.valorPrev, 0);
  const valorReal = rows.reduce((sum, row) => sum + row.valorReal, 0);
  const periodSelect = document.getElementById('prog-period-select');

  const filtersInfo = [
    ['Modo', progState.mode === 'day' ? 'Dia' : progState.mode === 'month' ? 'Mês' : 'Semana'],
    ['Período', periodSelect?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Ano', progState.year === 'all' ? 'Todos os anos' : progState.year],
    ['Mês', progState.month === 'all' ? 'Todos os meses' : getMonthName(Number(progState.month))],
    ['Equipe', progState.team === 'all' ? 'Todas as equipes' : progState.team],
    ['Supervisor', progState.supervisor === 'all' ? 'Todos os supervisores' : titleCase(progState.supervisor)],
    ['Cidade', progState.city === 'all' ? 'Todas as cidades' : titleCase(progState.city)],
    ['Status', progState.status === 'all' ? 'Todos os status' : progState.status],
    ['Bloqueio', progState.blockFilter === 'blocked' ? 'Somente bloqueadas' : 'Todas'],
    ['Busca por nota/PEP', progState.nota || '—'],
    ['Total de registros (filtro principal)', fmtNumber(rows.length)],
    ['Concluídas', fmtNumber(counts.concluida)],
    ['Programadas', fmtNumber(counts.programada)],
    ['Reprogramadas', fmtNumber(counts.reprogramada)],
    ['Canceladas', fmtNumber(counts.cancelada)],
    ['Expurgo', fmtNumber(counts.expurgo)],
    ['Bloqueadas', fmtNumber(bloqueadas)],
    ['Valor da Obra (total)', fmtCurrencyExact(valorObra)],
    ['Valor de Serviços Prev. (total)', fmtCurrencyExact(valorPrev)],
    ['Valor Real por Dia (total)', fmtCurrencyExact(valorReal)],
  ];

  const statusOrder = ['concluida', 'programada', 'reprogramada', 'cancelada', 'expurgo'];
  const statusLabels = { concluida: 'Concluída', programada: 'Programada', reprogramada: 'Reprogramada', cancelada: 'Cancelada', expurgo: 'Expurgo' };
  const statusRows = statusOrder.map((key) => {
    const statusRowsArr = rows.filter((row) => row.statusKey === key);
    return {
      Status: statusLabels[key],
      Registros: statusRowsArr.length,
      'Valor da Obra': statusRowsArr.reduce((sum, row) => sum + row.valorObra, 0),
      'Valor Previsto': statusRowsArr.reduce((sum, row) => sum + row.valorPrev, 0),
      'Valor Real': statusRowsArr.reduce((sum, row) => sum + row.valorReal, 0),
    };
  });

  const teamMap = new Map();
  rows.forEach((row) => {
    if (!teamMap.has(row.equipe)) {
      teamMap.set(row.equipe, { Equipe: row.equipe, Registros: 0, 'Valor da Obra': 0, 'Valor Previsto': 0, 'Valor Real': 0, Bloqueadas: 0 });
    }
    const item = teamMap.get(row.equipe);
    item.Registros += 1;
    item['Valor da Obra'] += row.valorObra;
    item['Valor Previsto'] += row.valorPrev;
    item['Valor Real'] += row.valorReal;
    if (row.bloqueada) item.Bloqueadas += 1;
  });
  const teamRows = Array.from(teamMap.values()).sort((a, b) => b.Registros - a.Registros);

  const cityMap = new Map();
  rows.forEach((row) => {
    const key = titleCase(row.cidade);
    if (!cityMap.has(key)) cityMap.set(key, { Cidade: key, Registros: 0, 'Valor da Obra': 0 });
    const item = cityMap.get(key);
    item.Registros += 1;
    item['Valor da Obra'] += row.valorObra;
  });
  const cityRows = Array.from(cityMap.values()).sort((a, b) => b.Registros - a.Registros);

  const detailRows = progGetExportRows().map((row) => ({
    'Nota Proj': row.notaProj,
    PEP: row.pep,
    Cidade: titleCase(row.cidade),
    Equipe: row.equipe,
    Supervisor: titleCase(row.supervisor),
    'Status SAP': row.statusSap,
    'Status Fis': row.statusFis,
    'Data de Execução': row.execDate ? formatDateLabel(row.execDate) : '',
    Progresso: row.progNecessaria ? `${row.numProgramacao}/${row.progNecessaria}` : '',
    Postes: row.postes,
    Bloqueio: row.bloqueada ? 'Bloqueada' : 'Livre',
    'Valor da Obra': row.valorObra,
    'Valor Previsto': row.valorPrev,
    'Valor Real': row.valorReal,
  }));

  return { filtersInfo, statusRows, teamRows, cityRows, detailRows };
}

function progExportXlsx() {
  const bundle = progGetExportBundle();
  if (!bundle.detailRows.length) {
    alert('Nenhum dado disponível para exportar com os filtros atuais.');
    return;
  }

  const moneyCols = ['valor'];
  const fileName = `Cena_Programacao_${new Date().toISOString().slice(0, 10)}.xlsx`;
  exportStyledXlsx([
    { name: 'Resumo',    data: [['Campo', 'Valor'], ...bundle.filtersInfo], type: 'aoa',  widths: [32, 26] },
    { name: 'Status',    data: bundle.statusRows,  type: 'json', widths: [16, 12, 16, 16, 16], moneyCols },
    { name: 'Equipes',   data: bundle.teamRows,    type: 'json', widths: [18, 12, 16, 16, 16, 12], moneyCols },
    { name: 'Cidades',   data: bundle.cityRows,    type: 'json', widths: [20, 12, 16], moneyCols },
    { name: 'Registros', data: bundle.detailRows,   type: 'json', widths: [12, 18, 18, 14, 20, 14, 14, 14, 10, 9, 10, 16, 16, 16], moneyCols },
  ], fileName, { autoFilter: true });
}

function progGenerateInsights(rows) {
  const insights = [];
  const total = rows.length;
  if (!total) {
    insights.push({ severity: 'low', icon: 'ti-info-circle', title: 'Sem dados para os filtros atuais', desc: 'Ajuste os filtros para gerar insights.' });
    return insights;
  }

  const counts = progBuildStatusBreakdown(rows);
  const bloqueadas = rows.filter((row) => row.bloqueada).length;
  const blockRate = bloqueadas / total;
  const cancelRate = (counts.cancelada + counts.expurgo) / total;

  if (blockRate >= 0.2) {
    insights.push({ severity: 'high', icon: 'ti-lock', title: `${fmtNumber(bloqueadas)} ordens bloqueadas (${(blockRate * 100).toFixed(1)}% do total)`, desc: 'Taxa de bloqueio acima do esperado — verifique pendências de BLOK/PD.' });
  } else if (blockRate >= 0.08) {
    insights.push({ severity: 'medium', icon: 'ti-lock', title: `${fmtNumber(bloqueadas)} ordens bloqueadas (${(blockRate * 100).toFixed(1)}%)`, desc: 'Volume de bloqueios relevante, vale acompanhar.' });
  } else {
    insights.push({ severity: 'good', icon: 'ti-lock-open', title: `Baixa taxa de bloqueio (${(blockRate * 100).toFixed(1)}%)`, desc: 'A maior parte das ordens está livre para execução.' });
  }

  if (cancelRate >= 0.1) {
    insights.push({ severity: 'high', icon: 'ti-x', title: `${(cancelRate * 100).toFixed(1)}% das ordens canceladas/expurgadas`, desc: `${fmtNumber(counts.cancelada)} canceladas + ${fmtNumber(counts.expurgo)} expurgadas de ${fmtNumber(total)} registros.` });
  }

  const teamBlockMap = new Map();
  rows.forEach((row) => { if (row.bloqueada) teamBlockMap.set(row.equipe, (teamBlockMap.get(row.equipe) || 0) + 1); });
  const topBlockedTeam = Array.from(teamBlockMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topBlockedTeam && topBlockedTeam[1] >= 3) {
    insights.push({ severity: 'medium', icon: 'ti-users', title: `Equipe ${topBlockedTeam[0]} concentra ${fmtNumber(topBlockedTeam[1])} bloqueios`, desc: 'Considere priorizar o desbloqueio dessa equipe.' });
  }

  const cityCancelMap = new Map();
  rows.forEach((row) => { if (row.statusKey === 'cancelada' || row.statusKey === 'expurgo') cityCancelMap.set(row.cidade, (cityCancelMap.get(row.cidade) || 0) + 1); });
  const topCancelCity = Array.from(cityCancelMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCancelCity && topCancelCity[1] >= 3) {
    insights.push({ severity: 'medium', icon: 'ti-map-pin', title: `${titleCase(topCancelCity[0])} tem ${fmtNumber(topCancelCity[1])} cancelamentos/expurgos`, desc: 'Município concentra parte relevante dos descartes.' });
  }

  const overflowParts = rows.filter((row) => row.progNecessaria > 0 && row.numProgramacao > row.progNecessaria).length;
  if (overflowParts > 0) {
    insights.push({ severity: 'medium', icon: 'ti-stack-2', title: `${fmtNumber(overflowParts)} registro(s) com mais partes executadas do que o necessário`, desc: 'Ex: parte 6 de 5 necessárias — verifique se a "Programação Necessária" está desatualizada.' });
  }

  const missingRealValue = rows.filter((row) => row.statusKey === 'concluida' && row.valorObra > 0 && row.valorReal === 0).length;
  if (missingRealValue > 0) {
    insights.push({ severity: 'medium', icon: 'ti-alert-triangle', title: `${fmtNumber(missingRealValue)} ordens concluídas sem valor real lançado`, desc: 'Possível pendência de apontamento de valor executado.' });
  }

  if (!insights.some((item) => item.severity === 'high')) {
    insights.push({ severity: 'good', icon: 'ti-circle-check', title: 'Nenhum ponto crítico identificado', desc: 'Os indicadores estão dentro da faixa esperada para os filtros atuais.' });
  }

  return insights;
}

function progRenderInsights() {
  const container = document.getElementById('prog-insights');
  if (!container) return;
  const insights = progGenerateInsights(progLastRows);
  container.innerHTML = `
    <div class="insight-card">
      <div class="ch"><div class="ct">Pontos de Atenção — Programação</div><div class="csub">${fmtNumber(progLastRows.length)} registros analisados</div></div>
      <div class="insight-grid">
        ${insights.map((item) => `
          <div class="insight-item insight-sev-${item.severity}">
            <div class="insight-icon"><i class="ti ${item.icon}" aria-hidden="true"></i></div>
            <div>
              <div class="insight-title">${item.title}</div>
              <div class="insight-desc">${item.desc}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function progToggleInsights() {
  const insightsEl = document.getElementById('prog-insights');
  const bodyEl = document.getElementById('prog-page-body');
  const btn = document.getElementById('prog-insights-toggle');
  if (!insightsEl || !bodyEl || !btn) return;
  const isOn = insightsEl.classList.toggle('on');
  bodyEl.classList.toggle('hidden', isOn);
  btn.classList.toggle('on', isOn);
  btn.innerHTML = isOn
    ? '<i class="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard'
    : '<i class="ti ti-bulb" aria-hidden="true"></i>Insights';
  if (isOn) progRenderInsights();
}

function progUpdateDashboard() {
  if (!progRows.length) return;
  progUpdateFilterControls();
  progLastRows = progGetFilteredRows();
  progRenderKpis(progLastRows);
  progRenderTable(progLastRows);
  if (typeof rebuildCharts === 'function') rebuildCharts();
  if (document.getElementById('prog-insights')?.classList.contains('on')) progRenderInsights();
}

async function progLoadPublishedSheet() {
  if (!window.Papa) return;
  const response = await fetch(PROG_DATA_SOURCE_URL);
  if (!response.ok) throw new Error(`Falha ao buscar CSV de Programação: ${response.status}`);
  const csvText = await response.text();
  const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true }).data;
  progRows = extractProgRows(parsed);
  progUpdateDashboard();
}

function progBindFilters() {
  if (progFiltersBound) return;
  progFiltersBound = true;

  progBindTableColumnFilters();

  document.querySelectorAll('#prog-mode-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      progState.mode = btn.dataset.mode;
      progState.periodKey = '';
      progUpdateDashboard();
    });
  });

  document.querySelectorAll('#prog-block-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      progState.blockFilter = btn.dataset.block;
      progUpdateDashboard();
    });
  });

  document.getElementById('prog-period-select')?.addEventListener('change', (event) => {
    progState.periodKey = event.target.value === 'all' ? '' : event.target.value;
    progUpdateDashboard();
  });

  document.getElementById('prog-year-select')?.addEventListener('change', (event) => {
    progState.year = event.target.value;
    progState.periodKey = '';
    progState.team = 'all';
    progState.supervisor = 'all';
    progState.city = 'all';
    progUpdateDashboard();
  });

  document.getElementById('prog-month-select')?.addEventListener('change', (event) => {
    progState.month = event.target.value;
    progState.periodKey = '';
    progState.team = 'all';
    progState.supervisor = 'all';
    progState.city = 'all';
    progUpdateDashboard();
  });

  document.getElementById('prog-team-select')?.addEventListener('change', (event) => {
    progState.team = event.target.value;
    progState.supervisor = 'all';
    progState.city = 'all';
    progUpdateDashboard();
  });

  document.getElementById('prog-supervisor-select')?.addEventListener('change', (event) => {
    progState.supervisor = event.target.value;
    progState.city = 'all';
    progUpdateDashboard();
  });

  document.getElementById('prog-city-select')?.addEventListener('change', (event) => {
    progState.city = event.target.value;
    progUpdateDashboard();
  });

  document.getElementById('prog-status-select')?.addEventListener('change', (event) => {
    progState.status = event.target.value;
    progUpdateDashboard();
  });

  document.getElementById('prog-nota-input')?.addEventListener('input', (event) => {
    progState.nota = event.target.value;
    progUpdateDashboard();
  });

  document.getElementById('prog-reset-filters')?.addEventListener('click', () => {
    progState.mode = 'week';
    progState.periodKey = '';
    progState.year = 'all';
    progState.month = 'all';
    progState.team = 'all';
    progState.supervisor = 'all';
    progState.city = 'all';
    progState.status = 'all';
    progState.blockFilter = 'all';
    progState.nota = '';
    const notaInput = document.getElementById('prog-nota-input');
    if (notaInput) notaInput.value = '';
    progTableFilters.cidade = 'all';
    progTableFilters.equipe = 'all';
    progTableFilters.supervisor = 'all';
    progTableFilters.statusSap = 'all';
    progTableFilters.statusFis = 'all';
    progTableFilters.bloqueio = 'all';
    progUpdateDashboard();
  });

  document.getElementById('prog-table-search')?.addEventListener('input', () => progRenderTable(progLastRows));

  document.getElementById('prog-export-xlsx')?.addEventListener('click', progExportXlsx);
  document.getElementById('prog-insights-toggle')?.addEventListener('click', progToggleInsights);
}

window.initProgramacao = async function initProgramacao() {
  progBindFilters();
  try {
    await progLoadPublishedSheet();
    setHTML('prog-live-pill', '<div class="live-dot"></div>Atualizado agora');
  } catch (error) {
    console.error('Falha ao carregar a base de Programação.', error);
    setHTML('prog-live-pill', '<div class="live-dot"></div>Falha ao carregar base ao vivo');
  }
};
