/* ═══════════════════════════════════════════════════════
   MAPA DE PROGRAMAÇÃO — heatmap equipe × dia (aba "MAPA DE PROGRAMAÇÃO")
   Depende de globais definidos no <script> inline do cena_dashboard_v2.html:
   setText, setHTML, fmtNumber, parseDateBR, parseInteger, formatDateLabel,
   formatMonthLabel, titleCase, buildSelectOptions.
═══════════════════════════════════════════════════════ */

const MAPA_DATA_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTE2IBM9w4xK0zGo1A4alA0fVM6uIcK7KShcFoTN93348ssJsLJ9ZaVtjRnnhtx7wLTM6n_-rvOKKij/pub?gid=981200797&single=true&output=csv';

let mapRows = [];
let mapDateColumns = [];
let mapFiltersBound = false;
const mapState = {
  monthKey: '',
  team: 'all',
  foreman: 'all',
};

function mapDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractMapData(parsedRows) {
  const headerIndex = parsedRows.findIndex((row) => Array.isArray(row) && String(row[0] || '').trim() === 'ENCARREGADO');
  if (headerIndex === -1) return { rows: [], dates: [] };
  const headerRow = parsedRows[headerIndex];

  const dateCols = [];
  for (let i = 2; i < headerRow.length; i++) {
    const date = parseDateBR(headerRow[i]);
    if (date instanceof Date && !Number.isNaN(date.getTime())) dateCols.push({ index: i, date });
  }

  const dataRows = parsedRows.slice(headerIndex + 1).filter((row) => Array.isArray(row) && String(row[0] || '').trim());

  const rows = dataRows.map((row) => {
    const daily = new Map();
    dateCols.forEach(({ index, date }) => {
      daily.set(mapDateKey(date), parseInteger(row[index]));
    });
    return {
      encarregado: row[0] || 'Sem encarregado',
      equipe: row[1] || 'Sem equipe',
      daily,
    };
  });

  return { rows, dates: dateCols.map((c) => c.date) };
}

function mapGetMonthOptions() {
  const map = new Map();
  mapDateColumns.forEach((date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { key, label: formatMonthLabel(date), order: Number(key.replace('-', '')) });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

function mapPickDefaultMonth(options) {
  if (!options.length) return '';
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (options.some((option) => option.key === todayKey)) return todayKey;
  return options[options.length - 1].key;
}

function mapBuildMonthSelect(options, currentValue) {
  const el = document.getElementById('map-month-select');
  if (!el) return;
  el.innerHTML = options.map((option) => `<option value="${option.key}">${option.label}</option>`).join('');
  el.value = options.some((option) => option.key === currentValue) ? currentValue : (options[0]?.key || '');
}

function mapGetMonthDays(monthKey) {
  if (!monthKey) return [];
  const [year, month] = monthKey.split('-').map(Number);
  return mapDateColumns
    .filter((date) => date.getFullYear() === year && (date.getMonth() + 1) === month)
    .sort((a, b) => a - b);
}

function mapUpdateFilterControls() {
  const monthOptions = mapGetMonthOptions();
  if (!monthOptions.some((option) => option.key === mapState.monthKey)) {
    mapState.monthKey = mapPickDefaultMonth(monthOptions);
  }
  mapBuildMonthSelect(monthOptions, mapState.monthKey);

  const teamOptions = Array.from(new Set(mapRows.map((row) => row.equipe)))
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((value) => ({ value, label: value }));
  if (mapState.team !== 'all' && !teamOptions.some((option) => option.value === mapState.team)) mapState.team = 'all';
  buildSelectOptions('map-team-select', teamOptions, mapState.team, 'Todas as equipes');

  const foremanOptions = Array.from(new Set(mapRows.map((row) => row.encarregado)))
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((value) => ({ value, label: titleCase(value) }));
  if (mapState.foreman !== 'all' && !foremanOptions.some((option) => option.value === mapState.foreman)) mapState.foreman = 'all';
  buildSelectOptions('map-foreman-select', foremanOptions, mapState.foreman, 'Todos os encarregados');

  const monthOption = monthOptions.find((option) => option.key === mapState.monthKey);
  setText('map-breadcrumb-month', monthOption?.label || 'Mapa de Programação');

  const monthDays = mapGetMonthDays(mapState.monthKey);
  if (monthDays.length) {
    const first = monthDays[0];
    const last = monthDays[monthDays.length - 1];
    setText('map-period-range', `(de ${formatDateLabel(first)} até ${formatDateLabel(last)})`);
  } else {
    setText('map-period-range', '');
  }
}

function mapGetFilteredRows() {
  return mapRows.filter((row) => {
    if (mapState.team !== 'all' && row.equipe !== mapState.team) return false;
    if (mapState.foreman !== 'all' && row.encarregado !== mapState.foreman) return false;
    return true;
  });
}

let mapLastDays = [];
let mapLastFilteredRows = [];
let mapLastDailyTotals = [];

function mapCellClass(value) {
  if (!value) return 'cell-0';
  if (value === 1) return 'cell-1';
  if (value === 2) return 'cell-2';
  return 'cell-3';
}

function mapRenderTable() {
  const days = mapGetMonthDays(mapState.monthKey);
  const rows = mapGetFilteredRows();
  mapLastDays = days;
  mapLastFilteredRows = rows;
  const thead = document.getElementById('map-table-head');
  const tbody = document.getElementById('map-table-body');
  if (!thead || !tbody) return;

  const weekdayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const headCells = days.map((date) => {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    return `<th class="${isWeekend ? 'weekend-col' : ''}">${weekdayNames[date.getDay()]}<br>${String(date.getDate()).padStart(2, '0')}</th>`;
  }).join('');
  thead.innerHTML = `<tr><th class="row-label">Encarregado</th><th class="row-label">Equipe</th>${headCells}<th>Total</th></tr>`;

  if (!days.length) {
    tbody.innerHTML = `<tr><td style="color:var(--t2);padding:14px">Nenhum dia encontrado para o mês selecionado.</td></tr>`;
    setText('map-table-subtitle', 'Sem dados para o mês selecionado.');
    setText('map-kpi-total', '0');
    setText('map-kpi-avg', '0');
    setText('map-kpi-peak', '—');
    setText('map-kpi-teams', '0');
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${days.length + 3}" style="color:var(--t2);padding:14px">Nenhuma equipe encontrada para os filtros selecionados.</td></tr>`;
    setText('map-table-subtitle', 'Sem equipes para os filtros selecionados.');
    setText('map-kpi-total', '0');
    setText('map-kpi-avg', '0');
    setText('map-kpi-peak', '—');
    setText('map-kpi-teams', '0');
    return;
  }

  const dailyTotals = days.map(() => 0);
  mapLastDailyTotals = dailyTotals;
  let grandTotal = 0;

  const bodyRows = rows.map((row) => {
    let rowTotal = 0;
    const cells = days.map((date, index) => {
      const value = row.daily.get(mapDateKey(date)) || 0;
      rowTotal += value;
      dailyTotals[index] += value;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const weekendClass = isWeekend ? ' weekend-col' : '';
      return `<td class="${mapCellClass(value)}${weekendClass}">${value || ''}</td>`;
    }).join('');
    grandTotal += rowTotal;
    return `<tr><td class="row-label">${titleCase(row.encarregado)}</td><td class="row-label">${row.equipe}</td>${cells}<td style="font-weight:600;color:var(--t1)">${fmtNumber(rowTotal)}</td></tr>`;
  });

  const totalCells = dailyTotals.map((value) => `<td>${value || ''}</td>`).join('');
  bodyRows.push(`<tr class="map-total"><td class="row-label">Total</td><td class="row-label"></td>${totalCells}<td>${fmtNumber(grandTotal)}</td></tr>`);

  tbody.innerHTML = bodyRows.join('');
  setText('map-table-subtitle', `${fmtNumber(rows.length)} equipes · ${fmtNumber(days.length)} dias · ${fmtNumber(grandTotal)} programações no mês`);

  let peakIndex = 0;
  dailyTotals.forEach((value, index) => { if (value > dailyTotals[peakIndex]) peakIndex = index; });
  const peakDay = days[peakIndex];
  const avg = grandTotal / days.length;

  setText('map-kpi-total', fmtNumber(grandTotal));
  setText('map-kpi-avg', avg.toFixed(1));
  setText('map-kpi-peak', peakDay ? formatDateLabel(peakDay) : '—');
  setHTML('map-kpi-peak-sub', `<i class="ti ti-flame" style="font-size:11px"></i>${fmtNumber(dailyTotals[peakIndex] || 0)} programações`);
  setText('map-kpi-teams', fmtNumber(rows.length));
}

function mapGenerateInsights() {
  const insights = [];
  const days = mapLastDays;
  const rows = mapLastFilteredRows;
  if (!days.length || !rows.length) {
    insights.push({ severity: 'low', icon: 'ti-info-circle', title: 'Sem dados para os filtros atuais', desc: 'Ajuste o mês ou os filtros para gerar insights.' });
    return insights;
  }

  const avg = mapLastDailyTotals.reduce((sum, value) => sum + value, 0) / (mapLastDailyTotals.length || 1);
  const overloadDays = days.filter((date, index) => mapLastDailyTotals[index] > avg * 1.5);
  if (overloadDays.length) {
    insights.push({
      severity: 'medium', icon: 'ti-flame',
      title: `${fmtNumber(overloadDays.length)} dia(s) com volume acima de 150% da média`,
      desc: `Média diária: ${avg.toFixed(1)} programações. Avalie redistribuir a carga nesses dias.`,
    });
  }

  const teamTotals = rows.map((row) => {
    let total = 0;
    days.forEach((date) => { total += row.daily.get(mapDateKey(date)) || 0; });
    return { equipe: row.equipe, total };
  }).sort((a, b) => b.total - a.total);

  const inactiveTeams = teamTotals.filter((item) => item.total === 0);
  if (inactiveTeams.length) {
    insights.push({
      severity: 'high', icon: 'ti-user-off',
      title: `${fmtNumber(inactiveTeams.length)} equipe(s) sem nenhuma programação no mês`,
      desc: inactiveTeams.map((item) => item.equipe).slice(0, 5).join(', '),
    });
  }

  const grand = teamTotals.reduce((sum, item) => sum + item.total, 0);
  const top = teamTotals[0];
  if (top && grand && (top.total / grand) >= 0.15) {
    insights.push({
      severity: 'medium', icon: 'ti-users',
      title: `${top.equipe} concentra ${((top.total / grand) * 100).toFixed(1)}% das programações do mês`,
      desc: `${fmtNumber(top.total)} de ${fmtNumber(grand)} programações no período filtrado.`,
    });
  }

  if (!insights.some((item) => item.severity === 'high')) {
    insights.push({ severity: 'good', icon: 'ti-circle-check', title: 'Carga de trabalho equilibrada', desc: 'Nenhuma equipe ou dia fora do padrão foi identificado.' });
  }

  return insights;
}

function mapRenderInsights() {
  const container = document.getElementById('map-insights');
  if (!container) return;
  const insights = mapGenerateInsights();
  container.innerHTML = `
    <div class="insight-card">
      <div class="ch"><div class="ct">Pontos de Atenção — Mapa de Programação</div><div class="csub">${fmtNumber(mapLastFilteredRows.length)} equipes analisadas</div></div>
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

function mapToggleInsights() {
  const insightsEl = document.getElementById('map-insights');
  const bodyEl = document.getElementById('map-page-body');
  const btn = document.getElementById('map-insights-toggle');
  if (!insightsEl || !bodyEl || !btn) return;
  const isOn = insightsEl.classList.toggle('on');
  bodyEl.classList.toggle('hidden', isOn);
  btn.classList.toggle('on', isOn);
  btn.innerHTML = isOn
    ? '<i class="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard'
    : '<i class="ti ti-bulb" aria-hidden="true"></i>Insights';
  if (isOn) mapRenderInsights();
}

function mapUpdateDashboard() {
  if (!mapRows.length) return;
  mapUpdateFilterControls();
  mapRenderTable();
  if (document.getElementById('map-insights')?.classList.contains('on')) mapRenderInsights();
}

function mapShiftMonth(delta) {
  const options = mapGetMonthOptions();
  const currentIndex = options.findIndex((option) => option.key === mapState.monthKey);
  const nextIndex = currentIndex + delta;
  if (nextIndex >= 0 && nextIndex < options.length) {
    mapState.monthKey = options[nextIndex].key;
    mapUpdateDashboard();
  }
}

async function mapLoadPublishedSheet() {
  if (!window.Papa) return;
  const response = await fetch(MAPA_DATA_SOURCE_URL);
  if (!response.ok) throw new Error(`Falha ao buscar CSV do Mapa: ${response.status}`);
  const csvText = await response.text();
  const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true }).data;
  const extracted = extractMapData(parsed);
  mapRows = extracted.rows;
  mapDateColumns = extracted.dates;
  mapUpdateDashboard();
}

function mapBindFilters() {
  if (mapFiltersBound) return;
  mapFiltersBound = true;

  document.getElementById('map-month-select')?.addEventListener('change', (event) => {
    mapState.monthKey = event.target.value;
    mapUpdateDashboard();
  });

  document.getElementById('map-team-select')?.addEventListener('change', (event) => {
    mapState.team = event.target.value;
    mapUpdateDashboard();
  });

  document.getElementById('map-foreman-select')?.addEventListener('change', (event) => {
    mapState.foreman = event.target.value;
    mapUpdateDashboard();
  });

  document.getElementById('map-month-prev')?.addEventListener('click', () => mapShiftMonth(-1));
  document.getElementById('map-month-next')?.addEventListener('click', () => mapShiftMonth(1));

  document.getElementById('map-reset-filters')?.addEventListener('click', () => {
    mapState.team = 'all';
    mapState.foreman = 'all';
    mapUpdateDashboard();
  });

  document.getElementById('map-insights-toggle')?.addEventListener('click', mapToggleInsights);
}

window.initMapa = async function initMapa() {
  mapBindFilters();
  try {
    await mapLoadPublishedSheet();
    setHTML('map-live-pill', '<div class="live-dot"></div>Atualizado agora');
  } catch (error) {
    console.error('Falha ao carregar o Mapa de Programação.', error);
    setHTML('map-live-pill', '<div class="live-dot"></div>Falha ao carregar base ao vivo');
  }
};
