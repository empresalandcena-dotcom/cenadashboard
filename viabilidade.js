/* ═══════════════════════════════════════════════════════
   VIABILIDADE — dados ao vivo (aba CONTROLE_GERAL via /api/controle-geral)
   Depende de globais definidos no <script> inline do cena_dashboard_v2.html:
   setText, setHTML, fmtNumber, fmtCurrencyExact, titleCase, getMonthName,
   formatDateLabel, formatMonthLabel, buildSelectOptions, mkChart, axCfg, rebuildCharts.
   Depende de cgLoadRows() (cg-data.js) e progGetWeekNumber() (programacao.js).
═══════════════════════════════════════════════════════ */

let viabRows = [];
let viabLastRows = [];
let viabFiltersBound = false;
const viabState = {
  mode: 'month',
  periodKey: '',
  carteira: 'all',
  pi: 'all',
  status: 'all',
  nota: '',
};

const viabTableFilters = {
  municipio: 'all',
  carteira: 'all',
  pi: 'all',
  status: 'all',
  tecnico: 'all',
  pep: 'all',
};
let viabTableFiltersBound = false;

function viabNormalizeStatus(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v.includes('EXPURGO')) return 'expurgo';
  if (v.includes('VIABILIZADO')) return 'viabilizado';
  if (v === 'APTO') return 'apto';
  if (v.includes('FALTA')) return 'falta';
  if (v.includes('DEV. CAMPO') || v.includes('DEV CAMPO')) return 'devCampo';
  if (v.includes('DEVOLU') || v.includes('PARCEIRA')) return 'devolucao';
  if (v.includes('PEND')) return 'pendente';
  return 'outros';
}

const VIAB_STATUS_LABELS = {
  expurgo: 'Expurgo',
  apto: 'Apto',
  falta: 'Falta Viabilizar',
  devolucao: 'Devolução',
  viabilizado: 'Viabilizado',
  devCampo: 'Dev. Campo',
  pendente: 'Pendente',
  outros: 'Outros',
};

function extractViabRows(rows) {
  return rows
    .filter((row) => row['NOTA'])
    .map((row) => ({
      nota: row['NOTA'],
      pep: row['PEP 3º Nível'] && row['PEP 3º Nível'] !== '-' ? row['PEP 3º Nível'] : '',
      viabStatusRaw: row['VIAB_STATUS'] || '',
      statusKey: viabNormalizeStatus(row['VIAB_STATUS']),
      carteira: row['CARTERIA'] || 'Sem carteira',
      municipio: row['MUNICIPIO'] || 'Sem município',
      pi: row['PI'] || 'Sem PI',
      tecnico: row['TÉC. VIABILIDADE'] || 'Sem técnico',
      dataEnvio: row['DATA_DE_ENVIO'] ? new Date(`${row['DATA_DE_ENVIO']}T00:00:00`) : null,
      licenciamento: row['LICENCIAMENTO'] || '',
      statusCampo: row['STATUS_CAMPO'] || '',
      statusPep: row['STATUS RESUMO'] || '-',
      temPep: String(row['STATUS RESUMO'] || '-').trim() !== '-',
    }));
}

function viabHasValidDate(row) {
  return row.dataEnvio instanceof Date && !Number.isNaN(row.dataEnvio.getTime());
}

function viabPeriodInfo(row, mode) {
  if (!viabHasValidDate(row)) {
    return { key: null, label: 'Sem data', order: -Infinity };
  }
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

function viabGetPeriodOptions(rows, mode) {
  const map = new Map();
  rows.forEach((row) => {
    const info = viabPeriodInfo(row, mode);
    if (info.key === null) return;
    if (!map.has(info.key)) map.set(info.key, info);
  });
  return Array.from(map.values()).sort((a, b) => b.order - a.order);
}

function viabGetPeriodRows(rows, mode, periodKey) {
  if (!periodKey) return rows;
  return rows.filter((row) => viabPeriodInfo(row, mode).key === periodKey);
}

function viabUniqueValues(rows, field) {
  return Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function viabFormatPeriodRange(rows) {
  const dated = rows.filter(viabHasValidDate);
  if (!dated.length) return '';
  const dates = dated.map((row) => row.dataEnvio.getTime());
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  if (min.getTime() === max.getTime()) return `(${formatDateLabel(min)})`;
  return `(de ${formatDateLabel(min)} até ${formatDateLabel(max)})`;
}

function viabUpdateFilterControls() {
  const periodOptions = viabGetPeriodOptions(viabRows, viabState.mode);
  if (!periodOptions.some((option) => option.key === viabState.periodKey)) viabState.periodKey = '';
  buildSelectOptions(
    'viab-period-select',
    periodOptions.map((option) => ({ value: option.key, label: option.label })),
    viabState.periodKey,
    viabState.mode === 'day' ? 'Todos os dias' : viabState.mode === 'month' ? 'Todos os meses' : 'Todas as semanas'
  );

  const carteiraOptions = viabUniqueValues(viabRows, 'carteira').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('viab-carteira-select', carteiraOptions, viabState.carteira, 'Todas as carteiras');

  const piOptions = viabUniqueValues(viabRows, 'pi').map((value) => ({ value, label: value }));
  buildSelectOptions('viab-pi-select', piOptions, viabState.pi, 'Todos os PIs');

  const statusOptions = Object.entries(VIAB_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  buildSelectOptions('viab-status-select', statusOptions, viabState.status, 'Todos os status');

  document.querySelectorAll('#viab-mode-seg .seg-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.mode === viabState.mode));

  const periodSelect = document.getElementById('viab-period-select');
  setText('viab-breadcrumb-period', periodSelect?.selectedOptions?.[0]?.textContent || 'Viabilidade');
}

function viabGetFilteredRows() {
  const periodRows = viabGetPeriodRows(viabRows, viabState.mode, viabState.periodKey);
  const filtered = periodRows.filter((row) => {
    if (viabState.carteira !== 'all' && row.carteira !== viabState.carteira) return false;
    if (viabState.pi !== 'all' && row.pi !== viabState.pi) return false;
    if (viabState.status !== 'all' && row.statusKey !== viabState.status) return false;
    if (viabState.nota) {
      const query = viabState.nota.trim().toLowerCase();
      if (query && !String(row.nota).toLowerCase().includes(query)) return false;
    }
    return true;
  });
  return filtered.slice().sort((a, b) => {
    const aTime = viabHasValidDate(a) ? a.dataEnvio.getTime() : -Infinity;
    const bTime = viabHasValidDate(b) ? b.dataEnvio.getTime() : -Infinity;
    return bTime - aTime;
  });
}

function viabBuildStatusBreakdown(rows) {
  const counts = { expurgo: 0, apto: 0, falta: 0, devolucao: 0, viabilizado: 0, devCampo: 0, pendente: 0, outros: 0 };
  rows.forEach((row) => { counts[row.statusKey] = (counts[row.statusKey] || 0) + 1; });
  return counts;
}

function viabRenderKpis(rows) {
  const total = rows.length;
  const counts = viabBuildStatusBreakdown(rows);
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const aptosComPep = rows.filter((row) => row.statusKey === 'apto' && row.temPep).length;
  const totalAptos = counts.apto;

  setText('viab-kpi-total', fmtNumber(total));
  setText('viab-kpi-aptos', fmtNumber(totalAptos));
  setHTML('viab-kpi-aptos-sub', `<i class="ti ti-arrow-up-right" style="font-size:11px"></i>${fmtNumber(aptosComPep)} com PEP`);
  setText('viab-kpi-expurgo', fmtNumber(counts.expurgo));
  setHTML('viab-kpi-expurgo-sub', `<i class="ti ti-arrow-down-right" style="font-size:11px"></i>${pct(counts.expurgo)}% do total`);
  setText('viab-kpi-falta', fmtNumber(counts.falta));
  setText('viab-kpi-devolucao', fmtNumber(counts.devolucao));
  setText('viab-kpi-devcampo', fmtNumber(counts.devCampo));
  setText('viab-kpi-pendente', fmtNumber(counts.pendente));
  setText('viab-kpi-viabilizado', fmtNumber(counts.viabilizado));
}

window.renderViabilidadeCharts = function renderViabilidadeCharts(C) {
  const rows = viabLastRows;
  const counts = viabBuildStatusBreakdown(rows);
  const total = rows.length;

  const statusOrder = ['expurgo', 'apto', 'falta', 'devolucao', 'viabilizado', 'devCampo', 'pendente'];
  const colorMap = { expurgo: C.red, apto: C.green, falta: C.yellow, devolucao: C.purple, viabilizado: C.cyan, devCampo: C.blue, pendente: C.gray };
  const sortedStatus = statusOrder
    .map((key) => ({ key, value: counts[key] || 0 }))
    .sort((a, b) => b.value - a.value);

  setText('viab-status-chart-subtitle', `Total: ${fmtNumber(total)} notas`);
  mkChart('ch1', {
    type: 'bar',
    data: {
      labels: sortedStatus.map((item) => VIAB_STATUS_LABELS[item.key]),
      datasets: [{ data: sortedStatus.map((item) => item.value), backgroundColor: sortedStatus.map((item) => colorMap[item.key]), borderRadius: 4, borderSkipped: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      plugins: { legend: { display: false } },
      indexAxis: 'y',
      scales: { x: axCfg(C), y: { ...axCfg(C), grid: { display: false } } },
    },
  });

  const monthMap = new Map();
  rows.forEach((row) => {
    if (!viabHasValidDate(row)) return;
    const key = `${row.dataEnvio.getFullYear()}-${String(row.dataEnvio.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { label: formatMonthLabel(row.dataEnvio), order: Number(key.replace('-', '')), value: 0 });
    monthMap.get(key).value += 1;
  });
  const monthSeries = Array.from(monthMap.values()).sort((a, b) => a.order - b.order);
  setText('viab-month-chart-subtitle', monthSeries.length ? `${monthSeries[0].label} → ${monthSeries[monthSeries.length - 1].label}` : 'Sem dados');
  mkChart('ch2', {
    type: 'bar',
    data: { labels: monthSeries.map((item) => item.label), datasets: [{ data: monthSeries.map((item) => item.value), backgroundColor: C.green, borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: false },
        valueLabelPlugin: { enabled: true, color: C.text, fontSize: 10, formatter: (value) => fmtNumber(value) },
      },
      scales: { x: { ...axCfg(C), grid: { display: false } }, y: { ...axCfg(C), display: false } },
    },
  });

  const piMap = new Map();
  rows.forEach((row) => { piMap.set(row.pi, (piMap.get(row.pi) || 0) + 1); });
  const piEntries = Array.from(piMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const piMax = piEntries[0]?.value || 1;
  const piColors = [C.green, C.blue, C.blue, C.yellow, C.gray, C.purple];
  const piContainer = document.getElementById('viab-pi-hbars');
  if (piContainer) {
    piContainer.innerHTML = piEntries.map((item, index) => {
      const pct = Math.max(2, Math.round((item.value / piMax) * 100));
      return `<div class="hrow"><div class="hlbl">${item.label}</div><div class="htrack"><div class="hfill" style="width:${pct}%;background:${piColors[index % piColors.length]}"></div></div><div class="hnum">${fmtNumber(item.value)}</div></div>`;
    }).join('') || '<div style="color:var(--t2);font-size:11px">Sem dados para os filtros atuais.</div>';
  }
};

function viabPopulateTableFilters(rows) {
  const municipioOptions = viabUniqueValues(rows, 'municipio').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('viab-col-municipio', municipioOptions, viabTableFilters.municipio, 'Todas');

  const carteiraOptions = viabUniqueValues(rows, 'carteira').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('viab-col-carteira', carteiraOptions, viabTableFilters.carteira, 'Todas');

  const piOptions = viabUniqueValues(rows, 'pi').map((value) => ({ value, label: value }));
  buildSelectOptions('viab-col-pi', piOptions, viabTableFilters.pi, 'Todos');

  const statusOptions = Object.entries(VIAB_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  buildSelectOptions('viab-col-status', statusOptions, viabTableFilters.status, 'Todos');

  const tecnicoOptions = viabUniqueValues(rows, 'tecnico').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('viab-col-tecnico', tecnicoOptions, viabTableFilters.tecnico, 'Todos');

  const pepEl = document.getElementById('viab-col-pep');
  if (pepEl) pepEl.value = viabTableFilters.pep;
}

function viabApplyTableFilters(rows) {
  return rows.filter((row) => {
    if (viabTableFilters.municipio !== 'all' && row.municipio !== viabTableFilters.municipio) return false;
    if (viabTableFilters.carteira !== 'all' && row.carteira !== viabTableFilters.carteira) return false;
    if (viabTableFilters.pi !== 'all' && row.pi !== viabTableFilters.pi) return false;
    if (viabTableFilters.status !== 'all' && row.statusKey !== viabTableFilters.status) return false;
    if (viabTableFilters.tecnico !== 'all' && row.tecnico !== viabTableFilters.tecnico) return false;
    if (viabTableFilters.pep === 'sim' && !row.temPep) return false;
    if (viabTableFilters.pep === 'nao' && row.temPep) return false;
    return true;
  });
}

function viabBindTableColumnFilters() {
  if (viabTableFiltersBound) return;
  viabTableFiltersBound = true;
  const fieldByElementId = {
    'viab-col-municipio': 'municipio',
    'viab-col-carteira': 'carteira',
    'viab-col-pi': 'pi',
    'viab-col-status': 'status',
    'viab-col-tecnico': 'tecnico',
    'viab-col-pep': 'pep',
  };
  Object.entries(fieldByElementId).forEach(([elementId, field]) => {
    document.getElementById(elementId)?.addEventListener('change', (event) => {
      viabTableFilters[field] = event.target.value;
      viabRenderTable(viabLastRows);
    });
  });
}

function viabGetExportRows() {
  const columnFiltered = viabApplyTableFilters(viabLastRows);
  const query = String(document.getElementById('viab-table-search')?.value || '').trim().toLowerCase();
  if (!query) return columnFiltered;
  return columnFiltered.filter((row) => [row.nota, row.pep, row.municipio, row.carteira, row.tecnico, row.viabStatusRaw]
    .join(' ').toLowerCase().includes(query));
}

function viabRenderTable(rows) {
  const tbody = document.getElementById('viab-table-body');
  if (!tbody) return;

  viabPopulateTableFilters(rows);
  const columnFiltered = viabApplyTableFilters(rows);

  const query = String(document.getElementById('viab-table-search')?.value || '').trim().toLowerCase();
  const filtered = columnFiltered.filter((row) => {
    if (!query) return true;
    return [row.nota, row.pep, row.municipio, row.carteira, row.tecnico, row.viabStatusRaw].join(' ').toLowerCase().includes(query);
  });

  setText('viab-table-subtitle', `${fmtNumber(filtered.length)} registros visíveis (mais recentes primeiro) de ${fmtNumber(rows.length)} filtrados · ${fmtNumber(viabRows.length)} na base publicada`);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--t2)">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  const visible = filtered.slice(0, 200);
  const rowsHtml = visible.map((row) => {
    const statusClass = row.statusKey === 'apto' ? 'ok'
      : row.statusKey === 'expurgo' ? 'no'
      : row.statusKey === 'falta' || row.statusKey === 'pendente' ? 'wn' : 'bl';
    const pepPill = row.temPep ? '<span class="pill ok">Com PEP</span>' : '<span class="pill wn">Sem PEP</span>';
    return `<tr>
      <td style="color:var(--t1);font-weight:500">${row.nota}</td>
      <td>${titleCase(row.municipio)}</td>
      <td>${titleCase(row.carteira)}</td>
      <td>${row.pi}</td>
      <td><span class="pill ${statusClass}">${row.viabStatusRaw || 'Sem status'}</span></td>
      <td>${titleCase(row.tecnico)}</td>
      <td>${row.dataEnvio ? formatDateLabel(row.dataEnvio) : '—'}</td>
      <td>${pepPill}</td>
      <td>${row.pep || '—'}</td>
    </tr>`;
  }).join('');

  const moreNotice = filtered.length > visible.length
    ? `<tr><td colspan="9" style="color:var(--t2);text-align:center">Mostrando ${fmtNumber(visible.length)} de ${fmtNumber(filtered.length)} — refine os filtros para ver mais.</td></tr>`
    : '';

  tbody.innerHTML = rowsHtml + moreNotice;
}

function viabGenerateInsights(rows) {
  const insights = [];
  const total = rows.length;
  if (!total) {
    insights.push({ severity: 'low', icon: 'ti-info-circle', title: 'Sem dados para os filtros atuais', desc: 'Ajuste os filtros para gerar insights.' });
    return insights;
  }

  const counts = viabBuildStatusBreakdown(rows);
  const expurgoRate = counts.expurgo / total;
  if (expurgoRate >= 0.35) {
    insights.push({ severity: 'high', icon: 'ti-trash', title: `${(expurgoRate * 100).toFixed(1)}% das notas foram expurgadas`, desc: `${fmtNumber(counts.expurgo)} de ${fmtNumber(total)} notas descartadas no recorte atual.` });
  } else if (expurgoRate >= 0.2) {
    insights.push({ severity: 'medium', icon: 'ti-trash', title: `Taxa de expurgo: ${(expurgoRate * 100).toFixed(1)}%`, desc: 'Vale acompanhar os motivos de descarte mais frequentes.' });
  }

  if (counts.falta > 0) {
    insights.push({ severity: counts.falta / total >= 0.2 ? 'high' : 'medium', icon: 'ti-clock-exclamation', title: `${fmtNumber(counts.falta)} notas aguardando viabilização`, desc: 'Ação necessária para não acumular atraso no funil.' });
  }

  const totalAptos = counts.apto;
  const aptosSemPep = rows.filter((row) => row.statusKey === 'apto' && !row.temPep).length;
  if (aptosSemPep > 0) {
    insights.push({ severity: 'medium', icon: 'ti-file-off', title: `${fmtNumber(aptosSemPep)} notas aptas ainda sem PEP`, desc: `De ${fmtNumber(totalAptos)} notas aptas, ${fmtNumber(aptosSemPep)} aguardam abertura de PEP.` });
  }

  const tecDevMap = new Map();
  rows.forEach((row) => { if (row.statusKey === 'devolucao') tecDevMap.set(row.tecnico, (tecDevMap.get(row.tecnico) || 0) + 1); });
  const topDevTec = Array.from(tecDevMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topDevTec && topDevTec[1] >= 5) {
    insights.push({ severity: 'medium', icon: 'ti-user-exclamation', title: `${titleCase(topDevTec[0])} concentra ${fmtNumber(topDevTec[1])} devoluções`, desc: 'Pode indicar necessidade de alinhamento técnico ou de projeto.' });
  }

  const muniMap = new Map();
  rows.forEach((row) => { if (row.statusKey === 'expurgo') muniMap.set(row.municipio, (muniMap.get(row.municipio) || 0) + 1); });
  const topExpMuni = Array.from(muniMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topExpMuni && topExpMuni[1] >= 10) {
    insights.push({ severity: 'medium', icon: 'ti-map-pin', title: `${titleCase(topExpMuni[0])} concentra ${fmtNumber(topExpMuni[1])} expurgos`, desc: 'Município com maior volume de notas descartadas.' });
  }

  const carteiraMap = new Map();
  rows.forEach((row) => { if (row.statusKey === 'expurgo') carteiraMap.set(row.carteira, (carteiraMap.get(row.carteira) || 0) + 1); });
  const carteiraTotalMap = new Map();
  rows.forEach((row) => { carteiraTotalMap.set(row.carteira, (carteiraTotalMap.get(row.carteira) || 0) + 1); });
  const topExpCarteira = Array.from(carteiraMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topExpCarteira) {
    const carteiraTotal = carteiraTotalMap.get(topExpCarteira[0]) || 1;
    const carteiraRate = topExpCarteira[1] / carteiraTotal;
    if (carteiraRate >= 0.45) {
      insights.push({ severity: 'medium', icon: 'ti-folder-exclamation', title: `${titleCase(topExpCarteira[0])}: ${(carteiraRate * 100).toFixed(1)}% de expurgo`, desc: `${fmtNumber(topExpCarteira[1])} de ${fmtNumber(carteiraTotal)} notas dessa carteira foram expurgadas.` });
    }
  }

  const dated = rows.filter(viabHasValidDate);
  if (dated.length) {
    const mostRecent = dated.reduce((latest, row) => (row.dataEnvio > latest.dataEnvio ? row : latest), dated[0]);
    const daysSince = Math.floor((Date.now() - mostRecent.dataEnvio.getTime()) / 86400000);
    if (daysSince > 14) {
      insights.push({ severity: 'medium', icon: 'ti-calendar-off', title: `Sem novos envios há ${fmtNumber(daysSince)} dias`, desc: `Último registro: ${formatDateLabel(mostRecent.dataEnvio)}. Verifique se a base está sendo atualizada.` });
    } else {
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const recentCount = dated.filter((row) => row.dataEnvio.getTime() >= sevenDaysAgo).length;
      insights.push({ severity: 'good', icon: 'ti-trending-up', title: `${fmtNumber(recentCount)} notas enviadas nos últimos 7 dias`, desc: `Último registro: ${formatDateLabel(mostRecent.dataEnvio)}.` });
    }
  }

  if (!insights.some((item) => item.severity === 'high')) {
    insights.push({ severity: 'good', icon: 'ti-circle-check', title: 'Nenhum ponto crítico identificado', desc: 'Os indicadores estão dentro da faixa esperada para os filtros atuais.' });
  }

  return insights;
}

function viabRenderInsights() {
  const container = document.getElementById('viab-insights');
  if (!container) return;
  const insights = viabGenerateInsights(viabLastRows);
  container.innerHTML = `
    <div class="insight-card">
      <div class="ch"><div class="ct">Pontos de Atenção — Viabilidade</div><div class="csub">${fmtNumber(viabLastRows.length)} notas analisadas</div></div>
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

function viabToggleInsights() {
  const insightsEl = document.getElementById('viab-insights');
  const bodyEl = document.getElementById('viab-page-body');
  const btn = document.getElementById('viab-insights-toggle');
  if (!insightsEl || !bodyEl || !btn) return;
  const isOn = insightsEl.classList.toggle('on');
  bodyEl.classList.toggle('hidden', isOn);
  btn.classList.toggle('on', isOn);
  btn.innerHTML = isOn
    ? '<i class="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard'
    : '<i class="ti ti-bulb" aria-hidden="true"></i>Insights';
  if (isOn) viabRenderInsights();
}

function viabGetExportBundle() {
  const rows = viabLastRows;
  const counts = viabBuildStatusBreakdown(rows);
  const periodSelect = document.getElementById('viab-period-select');

  const filtersInfo = [
    ['Modo', viabState.mode === 'day' ? 'Dia' : viabState.mode === 'week' ? 'Semana' : 'Mês'],
    ['Período', periodSelect?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Carteira', viabState.carteira === 'all' ? 'Todas' : titleCase(viabState.carteira)],
    ['PI', viabState.pi === 'all' ? 'Todos' : viabState.pi],
    ['Status', viabState.status === 'all' ? 'Todos' : VIAB_STATUS_LABELS[viabState.status] || viabState.status],
    ['Total de notas', fmtNumber(rows.length)],
    ['Aptas', fmtNumber(counts.apto)],
    ['Viabilizadas', fmtNumber(counts.viabilizado)],
    ['Expurgo', fmtNumber(counts.expurgo)],
    ['Falta Viabilizar', fmtNumber(counts.falta)],
    ['Devolução', fmtNumber(counts.devolucao)],
    ['Dev. Campo', fmtNumber(counts.devCampo)],
    ['Pendente', fmtNumber(counts.pendente)],
  ];

  const statusRows = Object.entries(VIAB_STATUS_LABELS).map(([key, label]) => ({
    Status: label,
    Registros: counts[key] || 0,
  }));

  const detailRows = viabGetExportRows().map((row) => ({
    Nota: row.nota,
    PEP: row.pep,
    Município: titleCase(row.municipio),
    Carteira: titleCase(row.carteira),
    PI: row.pi,
    Status: row.viabStatusRaw,
    'Técnico': titleCase(row.tecnico),
    'Data de Envio': row.dataEnvio ? formatDateLabel(row.dataEnvio) : '',
    'Tem PEP': row.temPep ? 'Sim' : 'Não',
  }));

  return { filtersInfo, statusRows, detailRows };
}

function viabExportXlsx() {
  if (!window.XLSX) {
    console.error('Biblioteca XLSX não carregada.');
    return;
  }

  const bundle = viabGetExportBundle();
  if (!bundle.detailRows.length) {
    alert('Nenhum dado disponível para exportar com os filtros atuais.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const resumoSheet = XLSX.utils.aoa_to_sheet([['Campo', 'Valor'], ...bundle.filtersInfo]);
  const statusSheet = XLSX.utils.json_to_sheet(bundle.statusRows);
  const detailSheet = XLSX.utils.json_to_sheet(bundle.detailRows);

  resumoSheet['!cols'] = [{ wch: 22 }, { wch: 26 }];
  statusSheet['!cols'] = [{ wch: 20 }, { wch: 12 }];
  detailSheet['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, resumoSheet, 'Resumo');
  XLSX.utils.book_append_sheet(wb, statusSheet, 'Status');
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Registros');

  const fileName = `Cena_Viabilidade_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName, { compression: true });
}

function viabUpdateDashboard() {
  if (!viabRows.length) return;
  viabUpdateFilterControls();
  viabLastRows = viabGetFilteredRows();
  viabRenderKpis(viabLastRows);
  viabRenderTable(viabLastRows);
  setText('viab-period-range', viabFormatPeriodRange(viabLastRows));
  if (typeof rebuildCharts === 'function') rebuildCharts();
  if (document.getElementById('viab-insights')?.classList.contains('on')) viabRenderInsights();
}

function viabBindFilters() {
  if (viabFiltersBound) return;
  viabFiltersBound = true;

  viabBindTableColumnFilters();

  document.querySelectorAll('#viab-mode-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viabState.mode = btn.dataset.mode;
      viabState.periodKey = '';
      viabUpdateDashboard();
    });
  });
  document.getElementById('viab-period-select')?.addEventListener('change', (event) => {
    viabState.periodKey = event.target.value === 'all' ? '' : event.target.value;
    viabUpdateDashboard();
  });
  document.getElementById('viab-carteira-select')?.addEventListener('change', (event) => {
    viabState.carteira = event.target.value;
    viabUpdateDashboard();
  });
  document.getElementById('viab-pi-select')?.addEventListener('change', (event) => {
    viabState.pi = event.target.value;
    viabUpdateDashboard();
  });
  document.getElementById('viab-status-select')?.addEventListener('change', (event) => {
    viabState.status = event.target.value;
    viabUpdateDashboard();
  });
  document.getElementById('viab-nota-input')?.addEventListener('input', (event) => {
    viabState.nota = event.target.value;
    viabUpdateDashboard();
  });
  document.getElementById('viab-reset-filters')?.addEventListener('click', () => {
    viabState.mode = 'month';
    viabState.periodKey = '';
    viabState.carteira = 'all';
    viabState.pi = 'all';
    viabState.status = 'all';
    viabState.nota = '';
    const notaInput = document.getElementById('viab-nota-input');
    if (notaInput) notaInput.value = '';
    viabTableFilters.municipio = 'all';
    viabTableFilters.carteira = 'all';
    viabTableFilters.pi = 'all';
    viabTableFilters.status = 'all';
    viabTableFilters.tecnico = 'all';
    viabTableFilters.pep = 'all';
    viabUpdateDashboard();
  });
  document.getElementById('viab-table-search')?.addEventListener('input', () => viabRenderTable(viabLastRows));
  document.getElementById('viab-export-xlsx')?.addEventListener('click', viabExportXlsx);
  document.getElementById('viab-insights-toggle')?.addEventListener('click', viabToggleInsights);
}

window.initViabilidade = async function initViabilidade() {
  viabBindFilters();
  try {
    const rows = await window.cgLoadRows();
    viabRows = extractViabRows(rows);
    viabUpdateDashboard();
    setHTML('viab-live-pill', '<div class="live-dot"></div>Atualizado agora');
  } catch (error) {
    console.error('Falha ao carregar a base de Viabilidade.', error);
    setHTML('viab-live-pill', '<div class="live-dot"></div>Falha ao carregar base ao vivo');
  }
};
