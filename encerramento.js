/* ═══════════════════════════════════════════════════════
   ENCERRAMENTO — dados ao vivo (aba CONTROLE_GERAL via /api/controle-geral)
   Depende de globais definidos no <script> inline do cena_dashboard_v2.html
   e de progGetWeekNumber() (programacao.js).
   Depende de cgLoadRows() (cg-data.js).
═══════════════════════════════════════════════════════ */

let encRows = [];
let encLastRows = [];
let encCascataRows = [];
let encFiltersBound = false;
const encState = {
  mode: 'month',
  periodKey: '',
  carteira: 'all',
  pi: 'all',
  situacao: 'all',
  responsavel: 'all',
  nota: '',
};

const encTableFilters = {
  situacao: 'all',
  responsavel: 'all',
  municipio: 'all',
  carteira: 'all',
  pi: 'all',
};
let encTableFiltersBound = false;

function extractEncRows(rows) {
  return rows
    .filter((row) => row['NOTA'] && row['ENCER_SITUAÇÃO'] && row['ENCER_SITUAÇÃO'] !== '-')
    .map((row) => {
      const responsavelRaw = row['VALIDAÇÃO_ENCERRAMENTO'] && row['VALIDAÇÃO_ENCERRAMENTO'] !== '-'
        ? row['VALIDAÇÃO_ENCERRAMENTO']
        : (row['TEC. FECHAMENTO'] && row['TEC. FECHAMENTO'] !== '-' ? row['TEC. FECHAMENTO'] : 'Sem responsável');
      const dataEnvioRaw = row['ENCER_DATA_ENVIO'] || row['MED_DATA_ENVIADA'];
      return {
        nota: row['NOTA'],
        situacao: row['ENCER_SITUAÇÃO'],
        responsavel: responsavelRaw,
        carteira: row['CARTERIA'] || 'Sem carteira',
        municipio: row['MUNICIPIO'] || 'Sem município',
        pi: row['PI'] || 'Sem PI',
        valorMo: typeof row['VALOR MÃO DE OBRA'] === 'number' ? row['VALOR MÃO DE OBRA'] : 0,
        valorMedido: typeof row['VALOR MEDIDO'] === 'number' ? row['VALOR MEDIDO'] : 0,
        valorFaturado: typeof row['VALOR FATURADO'] === 'number' ? row['VALOR FATURADO'] : 0,
        divergencia: typeof row['DIVERGÊNCIA'] === 'number' ? row['DIVERGÊNCIA'] : 0,
        dataEnvio: dataEnvioRaw ? new Date(`${dataEnvioRaw}T00:00:00`) : null,
      };
    });
}

function encHasValidDate(row) {
  return row.dataEnvio instanceof Date && !Number.isNaN(row.dataEnvio.getTime());
}

function encPeriodInfo(row, mode) {
  if (!encHasValidDate(row)) return { key: null, label: 'Sem data', order: -Infinity };
  const date = row.dataEnvio;
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

function encGetPeriodOptions(rows, mode) {
  const map = new Map();
  rows.forEach((row) => {
    const info = encPeriodInfo(row, mode);
    if (info.key === null) return;
    if (!map.has(info.key)) map.set(info.key, info);
  });
  return Array.from(map.values()).sort((a, b) => b.order - a.order);
}

function encGetPeriodRows(rows, mode, periodKey) {
  if (!periodKey) return rows;
  return rows.filter((row) => encPeriodInfo(row, mode).key === periodKey);
}

function encUniqueValues(rows, field) {
  return Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function encFormatPeriodRange(rows) {
  const dated = rows.filter(encHasValidDate);
  if (!dated.length) return '';
  const dates = dated.map((row) => row.dataEnvio.getTime());
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  if (min.getTime() === max.getTime()) return `(${formatDateLabel(min)})`;
  return `(de ${formatDateLabel(min)} até ${formatDateLabel(max)})`;
}

function encUpdateFilterControls() {
  const periodOptions = encGetPeriodOptions(encRows, encState.mode);
  if (!periodOptions.some((option) => option.key === encState.periodKey)) encState.periodKey = '';
  buildSelectOptions(
    'enc-period-select',
    periodOptions.map((option) => ({ value: option.key, label: option.label })),
    encState.periodKey,
    encState.mode === 'day' ? 'Todos os dias' : encState.mode === 'month' ? 'Todos os meses' : 'Todas as semanas'
  );

  const carteiraOptions = encUniqueValues(encRows, 'carteira').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('enc-carteira-select', carteiraOptions, encState.carteira, 'Todas as carteiras');

  const piOptions = encUniqueValues(encRows, 'pi').map((value) => ({ value, label: value }));
  buildSelectOptions('enc-pi-select', piOptions, encState.pi, 'Todos os PIs');

  const situacaoOptions = encUniqueValues(encRows, 'situacao').map((value) => ({ value, label: value }));
  buildSelectOptions('enc-situacao-select', situacaoOptions, encState.situacao, 'Todas as situações');

  const responsavelOptions = encUniqueValues(encRows, 'responsavel').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('enc-responsavel-select', responsavelOptions, encState.responsavel, 'Todos os responsáveis');

  document.querySelectorAll('#enc-mode-seg .seg-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.mode === encState.mode));

  const periodSelect = document.getElementById('enc-period-select');
  setText('enc-breadcrumb-period', periodSelect?.selectedOptions?.[0]?.textContent || 'Encerramento');
}

function encGetNonPeriodFilteredRows() {
  return encRows.filter((row) => {
    if (encState.carteira !== 'all' && row.carteira !== encState.carteira) return false;
    if (encState.pi !== 'all' && row.pi !== encState.pi) return false;
    if (encState.situacao !== 'all' && row.situacao !== encState.situacao) return false;
    if (encState.responsavel !== 'all' && row.responsavel !== encState.responsavel) return false;
    if (encState.nota) {
      const query = encState.nota.trim().toLowerCase();
      if (query && !String(row.nota).toLowerCase().includes(query)) return false;
    }
    return true;
  });
}

function encGetFilteredRows() {
  const nonPeriodRows = encGetNonPeriodFilteredRows();
  const filtered = encGetPeriodRows(nonPeriodRows, encState.mode, encState.periodKey);
  return filtered.slice().sort((a, b) => {
    const aTime = encHasValidDate(a) ? a.dataEnvio.getTime() : -Infinity;
    const bTime = encHasValidDate(b) ? b.dataEnvio.getTime() : -Infinity;
    return bTime - aTime;
  });
}

function encRenderKpis(rows) {
  const total = rows.length;
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  const faturada = rows.filter((row) => row.situacao.toUpperCase() === 'OBRA FATURADA').length;
  const medicaoEnviada = rows.filter((row) => row.situacao.toUpperCase() === 'MEDIÇÃO ENVIADA').length;
  const valorFaturado = rows.reduce((sum, row) => sum + row.valorFaturado, 0);
  const valorMedido = rows.reduce((sum, row) => sum + row.valorMedido, 0);

  setText('enc-kpi-total', fmtNumber(total));
  setText('enc-kpi-faturada', fmtNumber(faturada));
  setHTML('enc-kpi-faturada-sub', `<i class="ti ti-arrow-up-right" style="font-size:11px"></i>${pct(faturada)}% do total`);
  setText('enc-kpi-medicao', fmtNumber(medicaoEnviada));
  setHTML('enc-kpi-medicao-sub', `<i class="ti ti-send" style="font-size:11px"></i>${pct(medicaoEnviada)}% do total`);
  setText('enc-kpi-valor-faturado', fmtCurrencyCompact(valorFaturado));
  setHTML('enc-kpi-valor-faturado-sub', `<i class="ti ti-arrow-up-right" style="font-size:11px"></i>de ${fmtCurrencyCompact(valorMedido)} medido`);
}

function encRenderResumo(rows) {
  const grid = document.getElementById('enc-resumo-grid');
  if (!grid) return;

  const total = rows.length;
  setText('enc-resumo-subtitle', `${fmtNumber(total)} notas analisadas`);

  if (!total) {
    grid.innerHTML = '<div style="color:var(--t2);font-size:11px;padding:8px">Sem dados para os filtros atuais.</div>';
    return;
  }

  const statusMap = new Map();
  rows.forEach((row) => {
    if (!statusMap.has(row.situacao)) {
      statusMap.set(row.situacao, { situacao: row.situacao, count: 0, faturado: 0, medido: 0, mo: 0 });
    }
    const item = statusMap.get(row.situacao);
    item.count += 1;
    item.faturado += row.valorFaturado;
    item.medido += row.valorMedido;
    item.mo += row.valorMo;
  });

  const entries = Array.from(statusMap.values()).sort((a, b) => b.count - a.count);
  const isFaturada = (s) => s.toUpperCase() === 'OBRA FATURADA';

  grid.innerHTML = entries.map((item) => {
    const pct = Math.round((item.count / total) * 1000) / 10;
    const badgeColor = isFaturada(item.situacao) ? 'var(--green)' : 'var(--blue)';
    const badgeBg = isFaturada(item.situacao) ? 'var(--green-bg)' : 'var(--blue-bg)';
    return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;height:100%">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10.5px;color:${badgeColor};background:${badgeBg};padding:2px 8px;border-radius:4px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px" title="${item.situacao}">${item.situacao}</span>
        <span style="font-size:11px;color:var(--t2);margin-left:auto;flex-shrink:0">${pct}%</span>
      </div>
      <div style="font-size:24px;font-weight:700;color:var(--t1);line-height:1.1">${fmtNumber(item.count)}</div>
      <div style="font-size:10px;color:var(--t2);display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center">
        <span title="MO total">MO ${fmtCurrencyCompact(item.mo)}</span>
        <span title="Medido total">Med ${fmtCurrencyCompact(item.medido)}</span>
        <span title="Faturado total">Fat ${fmtCurrencyCompact(item.faturado)}</span>
      </div>
    </div>`;
  }).join('');
}

window.renderEncerramentoCharts = function renderEncerramentoCharts(C) {
  const rows = encLastRows;

  const nonPeriodRows = encGetNonPeriodFilteredRows();
  const trendOptions = encGetPeriodOptions(nonPeriodRows, encState.mode).slice().sort((a, b) => a.order - b.order);
  const trendCounts = trendOptions.map((option) => nonPeriodRows.filter((row) => encPeriodInfo(row, encState.mode).key === option.key).length);
  setText('enc-trend-subtitle', trendOptions.length ? `${trendOptions[0].label} → ${trendOptions[trendOptions.length - 1].label}` : 'Sem dados');
  mkChart('ch11', {
    type: 'line',
    data: {
      labels: trendOptions.map((option) => option.label),
      datasets: [{
        data: trendCounts,
        borderColor: C.green, backgroundColor: C.green + '22',
        pointBackgroundColor: C.green, pointRadius: 2.5,
        tension: .4, fill: true, borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      layout: { padding: { top: 22 } },
      plugins: {
        legend: { display: false },
        valueLabelPlugin: { enabled: true, color: C.text, fontSize: 13, formatter: (value) => fmtNumber(value) },
      },
      scales: { x: { ...axCfg(C), grid: { display: false } }, y: { ...axCfg(C), beginAtZero: true } },
    },
  });

  const situacaoMap = new Map();
  rows.forEach((row) => {
    if (!situacaoMap.has(row.situacao)) situacaoMap.set(row.situacao, { label: row.situacao, mo: 0, medido: 0, faturado: 0, count: 0 });
    const item = situacaoMap.get(row.situacao);
    item.mo += row.valorMo;
    item.medido += row.valorMedido;
    item.faturado += row.valorFaturado;
    item.count += 1;
  });
  const situacaoEntries = Array.from(situacaoMap.values()).sort((a, b) => b.count - a.count);

  setText('enc-situacao-chart-subtitle', `${fmtNumber(rows.length)} notas · valores em R$`);
  mkChart('ch8', {
    type: 'bar',
    data: {
      labels: situacaoEntries.map((item) => item.label),
      datasets: [
        { label: 'MO', data: situacaoEntries.map((item) => item.mo), backgroundColor: C.blue + 'cc', borderRadius: 2, minBarLength: 2 },
        { label: 'Medido', data: situacaoEntries.map((item) => item.medido), backgroundColor: C.green + 'cc', borderRadius: 2, minBarLength: 2 },
        { label: 'Faturado', data: situacaoEntries.map((item) => item.faturado), backgroundColor: C.yellow + 'cc', borderRadius: 2, minBarLength: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        valueLabelPlugin: { enabled: true, color: C.text, fontSize: 11, datasetIndexes: [0, 1, 2], formatter: (value) => fmtCurrencyCompact(value) },
      },
      scales: {
        x: { ...axCfg(C), grid: { display: false }, ticks: { ...axCfg(C).ticks, maxRotation: 30 } },
        y: { ...axCfg(C), ticks: { ...axCfg(C).ticks, callback: (v) => v >= 1e6 ? 'R$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? 'R$' + (v / 1e3).toFixed(0) + 'k' : v } },
      },
    },
  });

  const respMap = new Map();
  rows.forEach((row) => {
    if (!respMap.has(row.responsavel)) respMap.set(row.responsavel, { count: 0, valorFaturado: 0 });
    const item = respMap.get(row.responsavel);
    item.count += 1;
    item.valorFaturado += row.valorFaturado;
  });
  const respEntries = Array.from(respMap.entries()).map(([label, item]) => ({ label, value: item.count, valorFaturado: item.valorFaturado })).sort((a, b) => b.value - a.value);
  const respMax = respEntries[0]?.value || 1;
  const respColors = [C.green, C.blue, C.yellow, C.purple, C.gray, C.cyan];
  const respContainer = document.getElementById('enc-resp-hbars');
  if (respContainer) {
    respContainer.innerHTML = respEntries.length
      ? respEntries.map((item, index) => {
          const pct = Math.max(2, Math.round((item.value / respMax) * 100));
          const fullLabel = titleCase(item.label);
          return `<div class="hrow"><div class="hlbl" style="width:120px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${fullLabel}">${fullLabel}</div><div class="htrack"><div class="hfill" style="width:${pct}%;background:${respColors[index % respColors.length]}"></div></div><div class="hnum">${fmtNumber(item.value)}</div><div style="width:62px;text-align:right;font-size:10.5px;color:var(--t2);flex-shrink:0">${fmtCurrencyCompact(item.valorFaturado)}</div></div>`;
        }).join('')
      : '<div style="color:var(--t2);font-size:11px">Sem dados para os filtros atuais.</div>';
  }

  setText('enc-resp-subtitle', `${fmtNumber(respEntries.length)} responsáveis · ${fmtNumber(rows.length)} notas`);
  setText('enc-total-mo', fmtCurrencyCompact(rows.reduce((sum, row) => sum + row.valorMo, 0)));
  setText('enc-total-medido', fmtCurrencyCompact(rows.reduce((sum, row) => sum + row.valorMedido, 0)));
  setText('enc-total-faturado', fmtCurrencyCompact(rows.reduce((sum, row) => sum + row.valorFaturado, 0)));
  encRenderResumo(rows);
  encRenderCascataStatus(C);
};

function encRenderCascataStatus(C) {
  const rows = encCascataRows;
  if (!rows || !rows.length) return;

  const STATUS_ORDER = [
    'ABER // ABER', 'ABER // LOG',
    'LIB // LOG', 'LIB // ATEC', 'LIB // ENER', 'LIB // CONC', 'LIB // PEND', 'LIB // COMS', 'LIB // DFEC', 'LIB // MED', 'LIB // DEV', 'LIB // ENTE', 'LIB // CKCP',
    'ENTE // CKCP', 'ENTE // ANCE',
    'ENCE // ENCE',
  ];

  const countMap = new Map();
  rows.forEach((row) => {
    const status = row['STATUS RESUMO'];
    const encerSituacao = row['ENCER_SITUAÇÃO'];
    if (!status || status === '-') return;
    if (!encerSituacao || encerSituacao === '-') return;
    countMap.set(status, (countMap.get(status) || 0) + 1);
  });

  const labels = [];
  const counts = [];
  STATUS_ORDER.forEach((status) => {
    const count = countMap.get(status) || 0;
    if (count === 0) return;
    labels.push(status);
    counts.push(count);
  });

  if (!counts.length) return;

  let runningTotal = 0;
  const data = counts.map((count, index) => {
    const point = [runningTotal, runningTotal + count];
    runningTotal += count;
    return point;
  });

  labels.push('Total');
  data.push([0, runningTotal]);

  setText('enc-cascata-subtitle', `${fmtNumber(countMap.size)} status · ${fmtNumber(counts.reduce((a, b) => a + b, 0))} registros`);

  const isTotal = (ctx) => ctx.dataIndex === labels.length - 1;

  mkChart('ch12', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: (ctx) => isTotal(ctx) ? C.green : C.blue + 'cc',
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        valueLabelPlugin: { enabled: true, color: C.text, fontSize: 11, formatter: (rawValue) => fmtNumber(Array.isArray(rawValue) ? rawValue[1] - rawValue[0] : rawValue) },
      },
      scales: {
        x: { ...axCfg(C), grid: { display: false }, ticks: { ...axCfg(C).ticks, maxRotation: 45, font: { family: 'Poppins', size: 9 } } },
        y: { ...axCfg(C), beginAtZero: true, ticks: { ...axCfg(C).ticks, callback: (v) => v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v } },
      },
    },
  });
}

function encPopulateTableFilters(rows) {
  const situacaoOptions = encUniqueValues(rows, 'situacao').map((value) => ({ value, label: value }));
  buildSelectOptions('enc-col-situacao', situacaoOptions, encTableFilters.situacao, 'Todas');

  const responsavelOptions = encUniqueValues(rows, 'responsavel').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('enc-col-responsavel', responsavelOptions, encTableFilters.responsavel, 'Todos');

  const municipioOptions = encUniqueValues(rows, 'municipio').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('enc-col-municipio', municipioOptions, encTableFilters.municipio, 'Todas');

  const carteiraOptions = encUniqueValues(rows, 'carteira').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('enc-col-carteira', carteiraOptions, encTableFilters.carteira, 'Todas');

  const piOptions = encUniqueValues(rows, 'pi').map((value) => ({ value, label: value }));
  buildSelectOptions('enc-col-pi', piOptions, encTableFilters.pi, 'Todos');
}

function encApplyTableFilters(rows) {
  return rows.filter((row) => {
    if (encTableFilters.situacao !== 'all' && row.situacao !== encTableFilters.situacao) return false;
    if (encTableFilters.responsavel !== 'all' && row.responsavel !== encTableFilters.responsavel) return false;
    if (encTableFilters.municipio !== 'all' && row.municipio !== encTableFilters.municipio) return false;
    if (encTableFilters.carteira !== 'all' && row.carteira !== encTableFilters.carteira) return false;
    if (encTableFilters.pi !== 'all' && row.pi !== encTableFilters.pi) return false;
    return true;
  });
}

function encBindTableColumnFilters() {
  if (encTableFiltersBound) return;
  encTableFiltersBound = true;
  const fieldByElementId = {
    'enc-col-situacao': 'situacao',
    'enc-col-responsavel': 'responsavel',
    'enc-col-municipio': 'municipio',
    'enc-col-carteira': 'carteira',
    'enc-col-pi': 'pi',
  };
  Object.entries(fieldByElementId).forEach(([elementId, field]) => {
    document.getElementById(elementId)?.addEventListener('change', (event) => {
      encTableFilters[field] = event.target.value;
      encRenderTable(encLastRows);
    });
  });
}

function encGetExportRows() {
  const columnFiltered = encApplyTableFilters(encLastRows);
  const query = String(document.getElementById('enc-table-search')?.value || '').trim().toLowerCase();
  if (!query) return columnFiltered;
  return columnFiltered.filter((row) => [row.nota, row.municipio, row.responsavel].join(' ').toLowerCase().includes(query));
}

function encRenderTable(rows) {
  const tbody = document.getElementById('enc-table-body');
  if (!tbody) return;

  encPopulateTableFilters(rows);
  const columnFiltered = encApplyTableFilters(rows);

  const query = String(document.getElementById('enc-table-search')?.value || '').trim().toLowerCase();
  const filtered = columnFiltered.filter((row) => {
    if (!query) return true;
    return [row.nota, row.municipio, row.responsavel].join(' ').toLowerCase().includes(query);
  });

  setText('enc-table-subtitle', `${fmtNumber(filtered.length)} registros visíveis (mais recentes primeiro) de ${fmtNumber(rows.length)} filtrados · ${fmtNumber(encRows.length)} com encerramento na base`);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--t2)">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  const visible = filtered.slice(0, 200);
  const rowsHtml = visible.map((row) => {
    const isFaturada = row.situacao.toUpperCase() === 'OBRA FATURADA';
    const divergenciaColor = Math.abs(row.divergencia) > 0 ? (row.divergencia > 0 ? 'var(--green)' : 'var(--red)') : 'var(--t2)';
    return `<tr>
      <td style="color:var(--t1);font-weight:500">${row.nota}</td>
      <td><span class="pill ${isFaturada ? 'ok' : 'bl'}">${row.situacao}</span></td>
      <td>${titleCase(row.responsavel)}</td>
      <td>${titleCase(row.municipio)}</td>
      <td>${titleCase(row.carteira)}</td>
      <td>${row.pi}</td>
      <td>${fmtCurrencyCompact(row.valorMo)}</td>
      <td>${fmtCurrencyCompact(row.valorMedido)}</td>
      <td>${fmtCurrencyCompact(row.valorFaturado)}</td>
      <td style="color:${divergenciaColor}">${fmtCurrencyCompact(row.divergencia)}</td>
      <td>${row.dataEnvio ? formatDateLabel(row.dataEnvio) : '—'}</td>
    </tr>`;
  }).join('');

  const moreNotice = filtered.length > visible.length
    ? `<tr><td colspan="11" style="color:var(--t2);text-align:center">Mostrando ${fmtNumber(visible.length)} de ${fmtNumber(filtered.length)} — refine os filtros para ver mais.</td></tr>`
    : '';

  tbody.innerHTML = rowsHtml + moreNotice;
}

function encGenerateInsights(rows) {
  const insights = [];
  const total = rows.length;
  if (!total) {
    insights.push({ severity: 'low', icon: 'ti-info-circle', title: 'Sem dados para os filtros atuais', desc: 'Ajuste os filtros para gerar insights.' });
    return insights;
  }

  const divergentes = rows.filter((row) => Math.abs(row.divergencia) > 0);
  const divergenteRate = divergentes.length / total;
  if (divergenteRate >= 0.3) {
    insights.push({ severity: 'high', icon: 'ti-alert-triangle', title: `${fmtNumber(divergentes.length)} notas com divergência entre medido e faturado (${(divergenteRate * 100).toFixed(1)}%)`, desc: 'Volume relevante de divergência — vale revisar critérios de medição/faturamento.' });
  } else if (divergentes.length > 0) {
    insights.push({ severity: 'medium', icon: 'ti-alert-triangle', title: `${fmtNumber(divergentes.length)} notas com divergência entre medido e faturado`, desc: `${(divergenteRate * 100).toFixed(1)}% do total no recorte atual.` });
  }

  const situacaoMap = new Map();
  rows.forEach((row) => { situacaoMap.set(row.situacao, (situacaoMap.get(row.situacao) || 0) + 1); });
  const topSituacao = Array.from(situacaoMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topSituacao && topSituacao[0].toUpperCase() !== 'OBRA FATURADA' && topSituacao[1] / total >= 0.25) {
    insights.push({ severity: 'medium', icon: 'ti-progress-alert', title: `${fmtNumber(topSituacao[1])} notas concentradas em "${topSituacao[0]}"`, desc: 'Possível ponto de represamento antes do faturamento — vale investigar o gargalo.' });
  }

  const respMap = new Map();
  rows.forEach((row) => { respMap.set(row.responsavel, (respMap.get(row.responsavel) || 0) + 1); });
  const topResp = Array.from(respMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topResp && topResp[1] / total >= 0.3) {
    insights.push({ severity: 'medium', icon: 'ti-user-exclamation', title: `${titleCase(topResp[0])} concentra ${fmtNumber(topResp[1])} notas (${((topResp[1] / total) * 100).toFixed(1)}%)`, desc: 'Carga de trabalho concentrada em um único responsável de fechamento.' });
  }

  const valorMedido = rows.reduce((sum, row) => sum + row.valorMedido, 0);
  const valorFaturado = rows.reduce((sum, row) => sum + row.valorFaturado, 0);
  if (valorMedido > 0) {
    const faturamentoRate = valorFaturado / valorMedido;
    insights.push({ severity: faturamentoRate >= 0.7 ? 'good' : faturamentoRate >= 0.4 ? 'medium' : 'high', icon: 'ti-currency-dollar', title: `${(faturamentoRate * 100).toFixed(1)}% do valor medido já foi faturado`, desc: `${fmtCurrencyCompact(valorFaturado)} faturados de ${fmtCurrencyCompact(valorMedido)} medidos.` });
  }

  const pendentesFaturamento = rows.filter((row) => row.situacao.toUpperCase() !== 'OBRA FATURADA');
  const carteiraPendenteMap = new Map();
  pendentesFaturamento.forEach((row) => { carteiraPendenteMap.set(row.carteira, (carteiraPendenteMap.get(row.carteira) || 0) + 1); });
  const topCarteiraPendente = Array.from(carteiraPendenteMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCarteiraPendente && topCarteiraPendente[1] >= 3) {
    insights.push({ severity: 'medium', icon: 'ti-folder-exclamation', title: `${titleCase(topCarteiraPendente[0])} concentra ${fmtNumber(topCarteiraPendente[1])} notas ainda não faturadas`, desc: `De ${fmtNumber(pendentesFaturamento.length)} notas pendentes de faturamento no recorte atual.` });
  }

  const faturadas = rows.filter((row) => row.situacao.toUpperCase() === 'OBRA FATURADA' && row.valorFaturado > 0);
  if (faturadas.length > 0) {
    const ticketMedio = faturadas.reduce((sum, row) => sum + row.valorFaturado, 0) / faturadas.length;
    insights.push({ severity: 'good', icon: 'ti-receipt-2', title: `Ticket médio de ${fmtCurrencyCompact(ticketMedio)} por nota faturada`, desc: `Calculado sobre ${fmtNumber(faturadas.length)} notas com "Obra Faturada" no recorte atual.` });
  }

  const respValorMap = new Map();
  rows.forEach((row) => { respValorMap.set(row.responsavel, (respValorMap.get(row.responsavel) || 0) + row.valorFaturado); });
  const topRespValor = Array.from(respValorMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topRespValor && topRespValor[1] > 0 && valorFaturado > 0 && topRespValor[1] / valorFaturado >= 0.3) {
    insights.push({ severity: 'medium', icon: 'ti-coin', title: `${titleCase(topRespValor[0])} responde por ${fmtCurrencyCompact(topRespValor[1])} do valor faturado`, desc: `${((topRespValor[1] / valorFaturado) * 100).toFixed(1)}% do total faturado no recorte atual.` });
  }

  const dated = rows.filter(encHasValidDate);
  if (dated.length) {
    const mostRecent = dated.reduce((latest, row) => (row.dataEnvio > latest.dataEnvio ? row : latest), dated[0]);
    const daysSince = Math.floor((Date.now() - mostRecent.dataEnvio.getTime()) / 86400000);
    if (daysSince > 14) {
      insights.push({ severity: 'medium', icon: 'ti-calendar-off', title: `Sem novos envios há ${fmtNumber(daysSince)} dias`, desc: `Último registro: ${formatDateLabel(mostRecent.dataEnvio)}.` });
    }
  }

  if (!insights.some((item) => item.severity === 'high')) {
    insights.push({ severity: 'good', icon: 'ti-circle-check', title: 'Nenhum ponto crítico identificado', desc: 'Os indicadores estão dentro da faixa esperada para os filtros atuais.' });
  }

  return insights;
}

function encRenderInsights() {
  const container = document.getElementById('enc-insights');
  if (!container) return;
  const insights = encGenerateInsights(encLastRows);
  container.innerHTML = `
    <div class="insight-card">
      <div class="ch"><div class="ct">Pontos de Atenção — Encerramento</div><div class="csub">${fmtNumber(encLastRows.length)} notas analisadas</div></div>
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

function encToggleInsights() {
  const insightsEl = document.getElementById('enc-insights');
  const bodyEl = document.getElementById('enc-page-body');
  const btn = document.getElementById('enc-insights-toggle');
  if (!insightsEl || !bodyEl || !btn) return;
  const isOn = insightsEl.classList.toggle('on');
  bodyEl.classList.toggle('hidden', isOn);
  btn.classList.toggle('on', isOn);
  btn.innerHTML = isOn
    ? '<i class="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard'
    : '<i class="ti ti-bulb" aria-hidden="true"></i>Insights';
  if (isOn) encRenderInsights();
}

function encGetExportBundle() {
  const rows = encLastRows;
  const periodSelect = document.getElementById('enc-period-select');

  const filtersInfo = [
    ['Modo', encState.mode === 'day' ? 'Dia' : encState.mode === 'week' ? 'Semana' : 'Mês'],
    ['Período', periodSelect?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Carteira', encState.carteira === 'all' ? 'Todas' : titleCase(encState.carteira)],
    ['PI', encState.pi === 'all' ? 'Todos' : encState.pi],
    ['Situação', encState.situacao === 'all' ? 'Todas' : encState.situacao],
    ['Responsável', encState.responsavel === 'all' ? 'Todos' : titleCase(encState.responsavel)],
    ['Total de notas', fmtNumber(rows.length)],
    ['Valor MO', fmtCurrencyCompact(rows.reduce((sum, row) => sum + row.valorMo, 0))],
    ['Valor Medido', fmtCurrencyCompact(rows.reduce((sum, row) => sum + row.valorMedido, 0))],
    ['Valor Faturado', fmtCurrencyCompact(rows.reduce((sum, row) => sum + row.valorFaturado, 0))],
  ];

  const situacaoMap = new Map();
  rows.forEach((row) => { situacaoMap.set(row.situacao, (situacaoMap.get(row.situacao) || 0) + 1); });
  const situacaoRows = Array.from(situacaoMap.entries()).map(([situacao, count]) => ({ Situação: situacao, Registros: count })).sort((a, b) => b.Registros - a.Registros);

  const detailRows = encGetExportRows().map((row) => ({
    Nota: row.nota,
    Situação: row.situacao,
    Responsável: titleCase(row.responsavel),
    Município: titleCase(row.municipio),
    Carteira: titleCase(row.carteira),
    PI: row.pi,
    'Valor MO': row.valorMo,
    'Valor Medido': row.valorMedido,
    'Valor Faturado': row.valorFaturado,
    'Divergência': row.divergencia,
    'Data de Envio': row.dataEnvio ? formatDateLabel(row.dataEnvio) : '',
  }));

  return { filtersInfo, situacaoRows, detailRows };
}

function encExportXlsx() {
  if (!window.XLSX) {
    console.error('Biblioteca XLSX não carregada.');
    return;
  }

  const bundle = encGetExportBundle();
  if (!bundle.detailRows.length) {
    alert('Nenhum dado disponível para exportar com os filtros atuais.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const resumoSheet = XLSX.utils.aoa_to_sheet([['Campo', 'Valor'], ...bundle.filtersInfo]);
  const situacaoSheet = XLSX.utils.json_to_sheet(bundle.situacaoRows);
  const detailSheet = XLSX.utils.json_to_sheet(bundle.detailRows);

  resumoSheet['!cols'] = [{ wch: 22 }, { wch: 26 }];
  situacaoSheet['!cols'] = [{ wch: 24 }, { wch: 12 }];
  detailSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  XLSX.utils.book_append_sheet(wb, resumoSheet, 'Resumo');
  XLSX.utils.book_append_sheet(wb, situacaoSheet, 'Situação');
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Registros');

  const fileName = `Cena_Encerramento_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName, { compression: true });
}

function encUpdateDashboard() {
  if (!encRows.length) return;
  encUpdateFilterControls();
  encLastRows = encGetFilteredRows();
  encRenderKpis(encLastRows);
  encRenderResumo(encLastRows);
  encRenderTable(encLastRows);
  setText('enc-period-range', encFormatPeriodRange(encLastRows));
  if (typeof rebuildCharts === 'function') rebuildCharts();
  if (document.getElementById('enc-insights')?.classList.contains('on')) encRenderInsights();
}

function encBindFilters() {
  if (encFiltersBound) return;
  encFiltersBound = true;

  encBindTableColumnFilters();

  document.querySelectorAll('#enc-mode-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      encState.mode = btn.dataset.mode;
      encState.periodKey = '';
      encUpdateDashboard();
    });
  });
  document.getElementById('enc-period-select')?.addEventListener('change', (event) => {
    encState.periodKey = event.target.value === 'all' ? '' : event.target.value;
    encUpdateDashboard();
  });
  document.getElementById('enc-carteira-select')?.addEventListener('change', (event) => {
    encState.carteira = event.target.value;
    encUpdateDashboard();
  });
  document.getElementById('enc-pi-select')?.addEventListener('change', (event) => {
    encState.pi = event.target.value;
    encUpdateDashboard();
  });
  document.getElementById('enc-situacao-select')?.addEventListener('change', (event) => {
    encState.situacao = event.target.value;
    encUpdateDashboard();
  });
  document.getElementById('enc-responsavel-select')?.addEventListener('change', (event) => {
    encState.responsavel = event.target.value;
    encUpdateDashboard();
  });
  document.getElementById('enc-nota-input')?.addEventListener('input', (event) => {
    encState.nota = event.target.value;
    encUpdateDashboard();
  });
  document.getElementById('enc-reset-filters')?.addEventListener('click', () => {
    encState.mode = 'month';
    encState.periodKey = '';
    encState.carteira = 'all';
    encState.pi = 'all';
    encState.situacao = 'all';
    encState.responsavel = 'all';
    encState.nota = '';
    const notaInput = document.getElementById('enc-nota-input');
    if (notaInput) notaInput.value = '';
    encTableFilters.situacao = 'all';
    encTableFilters.responsavel = 'all';
    encTableFilters.municipio = 'all';
    encTableFilters.carteira = 'all';
    encTableFilters.pi = 'all';
    encUpdateDashboard();
  });
  document.getElementById('enc-table-search')?.addEventListener('input', () => encRenderTable(encLastRows));
  document.getElementById('enc-export-xlsx')?.addEventListener('click', encExportXlsx);
  document.getElementById('enc-insights-toggle')?.addEventListener('click', encToggleInsights);
}

window.initEncerramento = async function initEncerramento() {
  encBindFilters();
  try {
    const rows = await window.cgLoadRows();
    encCascataRows = rows;
    encRows = extractEncRows(rows);
    encUpdateDashboard();
    setHTML('enc-live-pill', '<div class="live-dot"></div>Atualizado agora');
  } catch (error) {
    console.error('Falha ao carregar a base de Encerramento.', error);
    setHTML('enc-live-pill', '<div class="live-dot"></div>Falha ao carregar base ao vivo');
  }
};
