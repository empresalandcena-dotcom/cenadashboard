/* ═══════════════════════════════════════════════════════
   PEP's — dados ao vivo (aba CONTROLE_GERAL via /api/controle-geral)
   Depende de globais definidos no <script> inline do cena_dashboard_v2.html
   e de helpers de viabilidade.js (viabNormalizeStatus) / programacao.js (progGetWeekNumber).
   Depende de cgLoadRows() (cg-data.js).
═══════════════════════════════════════════════════════ */

let pepsRows = [];
let pepsLastRows = [];
let pepsFiltersBound = false;
const pepsState = {
  mode: 'month',
  periodKey: '',
  carteira: 'all',
  pi: 'all',
  status: 'all',
  licenciamento: 'all',
  nota: '',
};
let pepsFunnelMode = 'fluxo';

const PEPS_FLOW_ORDER = [
  'ABER // ABER', 'ABER // LOG',
  'LIB // LOG', 'LIB // ATEC', 'LIB // ENER', 'LIB // CONC', 'LIB // PEND', 'LIB // COMS', 'LIB // DFEC', 'LIB // MED', 'LIB // DEV', 'LIB // ENTE', 'LIB // CKCP',
  'ENTE // CKCP', 'ENTE // ANCE',
  'ENCE // ENCE',
  'Sem PEP',
];

const pepsTableFilters = {
  municipio: 'all',
  carteira: 'all',
  pi: 'all',
  status: 'all',
  pep: 'all',
};
let pepsTableFiltersBound = false;

function extractPepsRows(rows) {
  return rows
    .filter((row) => row['NOTA'])
    .map((row) => ({
      nota: row['NOTA'],
      pep: row['PEP 3º Nível'] && row['PEP 3º Nível'] !== '-' ? row['PEP 3º Nível'] : '',
      statusResumo: row['STATUS RESUMO'] && row['STATUS RESUMO'] !== '-' ? row['STATUS RESUMO'] : '',
      statusPepRaw: row['STATUS PEP'] || '',
      viabStatusKey: viabNormalizeStatus(row['VIAB_STATUS']),
      carteira: row['CARTERIA'] || 'Sem carteira',
      municipio: row['MUNICIPIO'] || 'Sem município',
      pi: row['PI'] || 'Sem PI',
      licenciamento: row['LICENCIAMENTO'] || 'Sem informação',
      valorMaoObra: typeof row['VALOR MÃO DE OBRA'] === 'number' ? row['VALOR MÃO DE OBRA'] : 0,
      dataEnvio: row['DATA_DE_ENVIO'] ? new Date(`${row['DATA_DE_ENVIO']}T00:00:00`) : null,
      temPep: Boolean(row['STATUS RESUMO'] && row['STATUS RESUMO'] !== '-'),
    }))
    .filter((row) => row.viabStatusKey === 'apto');
}

function pepsHasValidDate(row) {
  return row.dataEnvio instanceof Date && !Number.isNaN(row.dataEnvio.getTime());
}

function pepsPeriodInfo(row, mode) {
  if (!pepsHasValidDate(row)) return { key: null, label: 'Sem data', order: -Infinity };
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

function pepsGetPeriodOptions(rows, mode) {
  const map = new Map();
  rows.forEach((row) => {
    const info = pepsPeriodInfo(row, mode);
    if (info.key === null) return;
    if (!map.has(info.key)) map.set(info.key, info);
  });
  return Array.from(map.values()).sort((a, b) => b.order - a.order);
}

function pepsGetPeriodRows(rows, mode, periodKey) {
  if (!periodKey) return rows;
  return rows.filter((row) => pepsPeriodInfo(row, mode).key === periodKey);
}

function pepsUniqueValues(rows, field) {
  return Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function pepsFormatPeriodRange(rows) {
  const dated = rows.filter(pepsHasValidDate);
  if (!dated.length) return '';
  const dates = dated.map((row) => row.dataEnvio.getTime());
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  if (min.getTime() === max.getTime()) return `(${formatDateLabel(min)})`;
  return `(de ${formatDateLabel(min)} até ${formatDateLabel(max)})`;
}

function pepsGetNonPeriodFilteredRows() {
  return pepsRows.filter((row) => {
    if (pepsState.carteira !== 'all' && row.carteira !== pepsState.carteira) return false;
    if (pepsState.pi !== 'all' && row.pi !== pepsState.pi) return false;
    if (pepsState.status !== 'all' && row.statusResumo !== pepsState.status) return false;
    if (pepsState.licenciamento !== 'all' && row.licenciamento !== pepsState.licenciamento) return false;
    if (pepsState.nota) {
      const query = pepsState.nota.trim().toLowerCase();
      if (query && !`${row.nota} ${row.pep}`.toLowerCase().includes(query)) return false;
    }
    return true;
  });
}

function pepsUpdateFilterControls() {
  const nonPeriodRows = pepsGetNonPeriodFilteredRows();
  const periodOptions = pepsGetPeriodOptions(nonPeriodRows, pepsState.mode);
  if (!periodOptions.some((option) => option.key === pepsState.periodKey)) pepsState.periodKey = '';
  buildSelectOptions(
    'peps-period-select',
    periodOptions.map((option) => ({ value: option.key, label: option.label })),
    pepsState.periodKey,
    pepsState.mode === 'day' ? 'Todos os dias' : pepsState.mode === 'month' ? 'Todos os meses' : 'Todas as semanas'
  );

  const carteiraOptions = pepsUniqueValues(pepsRows, 'carteira').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('peps-carteira-select', carteiraOptions, pepsState.carteira, 'Todas as carteiras');

  const piOptions = pepsUniqueValues(pepsRows, 'pi').map((value) => ({ value, label: value }));
  buildSelectOptions('peps-pi-select', piOptions, pepsState.pi, 'Todos os PIs');

  const statusOptions = pepsUniqueValues(pepsRows, 'statusResumo').map((value) => ({ value, label: value }));
  buildSelectOptions('peps-status-select', statusOptions, pepsState.status, 'Todos os status');

  document.querySelectorAll('#peps-mode-seg .seg-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.mode === pepsState.mode));

  const periodSelect = document.getElementById('peps-period-select');
  setText('peps-breadcrumb-period', periodSelect?.selectedOptions?.[0]?.textContent || "PEP's");
}

function pepsGetFilteredRows() {
  const nonPeriodRows = pepsGetNonPeriodFilteredRows();
  const periodRows = pepsGetPeriodRows(nonPeriodRows, pepsState.mode, pepsState.periodKey);
  return periodRows.slice().sort((a, b) => {
    const aTime = pepsHasValidDate(a) ? a.dataEnvio.getTime() : -Infinity;
    const bTime = pepsHasValidDate(b) ? b.dataEnvio.getTime() : -Infinity;
    return bTime - aTime;
  });
}

function pepsRenderKpis(rows) {
  const total = rows.length;
  const comPep = rows.filter((row) => row.temPep).length;
  const semPep = total - comPep;
  const pct = total ? Math.round((comPep / total) * 1000) / 10 : 0;

  setText('peps-kpi-total', fmtNumber(total));
  setText('peps-kpi-sem', fmtNumber(semPep));
  setText('peps-kpi-com', fmtNumber(comPep));
  setHTML('peps-kpi-com-sub', `<i class="ti ti-arrow-up-right" style="font-size:11px"></i>${pct}% do total`);

  const comPepRows = rows.filter((row) => row.temPep && pepsHasValidDate(row));
  const weekMap = new Map();
  comPepRows.forEach((row) => {
    const info = pepsPeriodInfo(row, 'week');
    if (info.key === null) return;
    weekMap.set(info.key, (weekMap.get(info.key) || 0) + 1);
  });
  const weekCounts = Array.from(weekMap.values());
  const avgWeekly = weekCounts.length ? weekCounts.reduce((sum, value) => sum + value, 0) / weekCounts.length : 0;
  setText('peps-kpi-media', avgWeekly.toFixed(1));
}

window.renderPepsCharts = function renderPepsCharts(C) {
  const rows = pepsLastRows;
  const total = rows.length;
  const comPep = rows.filter((row) => row.temPep).length;
  const semPep = total - comPep;

  const nonPeriodRows = pepsGetNonPeriodFilteredRows();
  const trendOptions = pepsGetPeriodOptions(nonPeriodRows, pepsState.mode).slice().sort((a, b) => a.order - b.order);
  const trendCounts = trendOptions.map((option) => nonPeriodRows.filter((row) => row.temPep && pepsPeriodInfo(row, pepsState.mode).key === option.key).length);
  setText('peps-trend-subtitle', trendOptions.length ? `${trendOptions[0].label} → ${trendOptions[trendOptions.length - 1].label}` : 'Sem dados');
  mkChart('ch3', {
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

  setText('peps-bar-subtitle', `${fmtNumber(total)} aptos · ${fmtNumber(comPep)} c/ PEP`);
  mkChart('ch4', {
    type: 'bar',
    data: {
      labels: ['Aptos', 'Sem PEP', 'Com PEP'],
      datasets: [{ data: [total, -semPep, comPep], backgroundColor: [C.blue, C.red, C.gray], borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      layout: { padding: { top: 22 } },
      plugins: {
        legend: { display: false },
        valueLabelPlugin: { enabled: true, color: C.text, fontSize: 13, formatter: (value) => fmtNumber(Math.abs(value)) },
      },
      scales: { x: { ...axCfg(C), grid: { display: false } }, y: { ...axCfg(C), display: false } },
    },
  });

  pepsRenderFunnel(rows);
};

function pepsRenderFunnel(rows) {
  const total = rows.length;
  const disponivel = rows.filter((row) => row.licenciamento.toLowerCase().includes('disponivel') || row.licenciamento.toLowerCase().includes('disponível')).length;
  const emLicenciamento = rows.filter((row) => row.licenciamento.toLowerCase().includes('licenciamento')).length;
  const badgesEl = document.getElementById('peps-funnel-badges');
  if (badgesEl) {
    badgesEl.innerHTML = `
      <div class="leg-item"><div class="leg-sq" style="background:var(--green)"></div>Disp. p/ Execução (${fmtNumber(disponivel)})</div>
      <div class="leg-item"><div class="leg-sq" style="background:var(--yellow)"></div>Em Licenciamento (${fmtNumber(emLicenciamento)})</div>
    `;
  }

  const funnelMap = new Map();
  rows.forEach((row) => {
    const key = row.statusResumo || 'Sem PEP';
    if (!funnelMap.has(key)) funnelMap.set(key, { label: key, count: 0, mdo: 0 });
    const item = funnelMap.get(key);
    item.count += 1;
    item.mdo += row.valorMaoObra;
  });

  let funnelEntries = Array.from(funnelMap.values());
  if (pepsFunnelMode === 'aptas') {
    funnelEntries = funnelEntries.filter((entry) => entry.label !== 'Sem PEP');
  }
  if (pepsFunnelMode === 'mdo') {
    funnelEntries = funnelEntries.slice().sort((a, b) => b.mdo - a.mdo);
  } else if (pepsFunnelMode === 'fluxo') {
    funnelEntries = funnelEntries.slice().sort((a, b) => {
      const aIndex = PEPS_FLOW_ORDER.indexOf(a.label);
      const bIndex = PEPS_FLOW_ORDER.indexOf(b.label);
      if (aIndex === -1 && bIndex === -1) return b.count - a.count;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  } else {
    funnelEntries = funnelEntries.slice().sort((a, b) => b.count - a.count);
  }

  const grandTotalMdo = funnelEntries.reduce((sum, entry) => sum + entry.mdo, 0);
  const funnelMax = funnelEntries.reduce((max, entry) => Math.max(max, entry.count), 1);
  const funnelColors = ['var(--green)', 'var(--blue)', 'var(--yellow)', 'var(--purple)', 'var(--t3)', 'var(--red)'];

  const funnelContainer = document.getElementById('peps-funnel-rows');
  if (funnelContainer) {
    funnelContainer.innerHTML = funnelEntries.length
      ? funnelEntries.map((entry, index) => {
          const pct = Math.max(2, Math.round((entry.count / funnelMax) * 100));
          const mdoPct = grandTotalMdo ? (entry.mdo / grandTotalMdo) * 100 : 0;
          const isEnce = entry.label.toUpperCase().includes('ENCE // ENCE');
          const isSemPep = entry.label === 'Sem PEP';
          const color = isEnce ? 'var(--green)' : isSemPep ? 'var(--t3)' : funnelColors[index % funnelColors.length];
          const labelStyle = isEnce ? ' style="color:var(--green);font-weight:500"' : isSemPep ? ' style="color:var(--t2)"' : '';
          return `<div class="fr">
            <div class="fl"${labelStyle}>${entry.label}</div>
            <div class="ft"><div class="ff" style="width:${pct}%;background:${color}"></div></div>
            <div class="fn"${isEnce ? ' style="color:var(--green)"' : ''}>${fmtNumber(entry.count)}</div>
            <div style="width:72px;text-align:right;font-size:10.5px;color:var(--t2)">${fmtCurrencyCompact(entry.mdo)}</div>
            <div style="width:42px;text-align:right;font-size:10px;color:var(--t3);margin-left:8px">${mdoPct.toFixed(1)}%</div>
          </div>`;
        }).join('')
      : '<div style="color:var(--t2);font-size:11px">Sem dados para os filtros atuais.</div>';
  }

  setText('peps-funnel-subtitle', `${fmtNumber(total)} registros · ${fmtCurrencyCompact(grandTotalMdo)} em MDO`);
  setHTML('peps-funnel-total', `TOTAL GERAL — ${fmtNumber(funnelEntries.reduce((sum, entry) => sum + entry.count, 0))} registros · ${fmtCurrencyCompact(grandTotalMdo)} · 100%`);
}

function pepsPopulateTableFilters(rows) {
  const municipioOptions = pepsUniqueValues(rows, 'municipio').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('peps-col-municipio', municipioOptions, pepsTableFilters.municipio, 'Todas');

  const carteiraOptions = pepsUniqueValues(rows, 'carteira').map((value) => ({ value, label: titleCase(value) }));
  buildSelectOptions('peps-col-carteira', carteiraOptions, pepsTableFilters.carteira, 'Todas');

  const piOptions = pepsUniqueValues(rows, 'pi').map((value) => ({ value, label: value }));
  buildSelectOptions('peps-col-pi', piOptions, pepsTableFilters.pi, 'Todos');

  const statusOptions = pepsUniqueValues(rows, 'statusResumo').map((value) => ({ value, label: value }));
  buildSelectOptions('peps-col-status', statusOptions, pepsTableFilters.status, 'Todos');

  const pepEl = document.getElementById('peps-col-pep');
  if (pepEl) pepEl.value = pepsTableFilters.pep;
}

function pepsApplyTableFilters(rows) {
  return rows.filter((row) => {
    if (pepsTableFilters.municipio !== 'all' && row.municipio !== pepsTableFilters.municipio) return false;
    if (pepsTableFilters.carteira !== 'all' && row.carteira !== pepsTableFilters.carteira) return false;
    if (pepsTableFilters.pi !== 'all' && row.pi !== pepsTableFilters.pi) return false;
    if (pepsTableFilters.status !== 'all' && row.statusResumo !== pepsTableFilters.status) return false;
    if (pepsTableFilters.pep === 'sim' && !row.temPep) return false;
    if (pepsTableFilters.pep === 'nao' && row.temPep) return false;
    return true;
  });
}

function pepsBindTableColumnFilters() {
  if (pepsTableFiltersBound) return;
  pepsTableFiltersBound = true;
  const fieldByElementId = {
    'peps-col-municipio': 'municipio',
    'peps-col-carteira': 'carteira',
    'peps-col-pi': 'pi',
    'peps-col-status': 'status',
    'peps-col-pep': 'pep',
  };
  Object.entries(fieldByElementId).forEach(([elementId, field]) => {
    document.getElementById(elementId)?.addEventListener('change', (event) => {
      pepsTableFilters[field] = event.target.value;
      pepsRenderTable(pepsLastRows);
    });
  });
}

function pepsGetExportRows() {
  const columnFiltered = pepsApplyTableFilters(pepsLastRows);
  const query = String(document.getElementById('peps-table-search')?.value || '').trim().toLowerCase();
  if (!query) return columnFiltered;
  return columnFiltered.filter((row) => [row.nota, row.pep, row.municipio, row.carteira, row.statusResumo]
    .join(' ').toLowerCase().includes(query));
}

function pepsRenderTable(rows) {
  const tbody = document.getElementById('peps-table-body');
  if (!tbody) return;

  pepsPopulateTableFilters(rows);
  const columnFiltered = pepsApplyTableFilters(rows);

  const query = String(document.getElementById('peps-table-search')?.value || '').trim().toLowerCase();
  const filtered = columnFiltered.filter((row) => {
    if (!query) return true;
    return [row.nota, row.pep, row.municipio, row.carteira, row.statusResumo].join(' ').toLowerCase().includes(query);
  });

  setText('peps-table-subtitle', `${fmtNumber(filtered.length)} registros visíveis (mais recentes primeiro) de ${fmtNumber(rows.length)} filtrados · ${fmtNumber(pepsRows.length)} aptos na base`);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--t2)">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  const visible = filtered.slice(0, 200);
  const rowsHtml = visible.map((row) => {
    const pepPill = row.temPep ? '<span class="pill ok">Com PEP</span>' : '<span class="pill wn">Sem PEP</span>';
    return `<tr>
      <td style="color:var(--t1);font-weight:500">${row.nota}</td>
      <td>${row.pep || '—'}</td>
      <td>${titleCase(row.municipio)}</td>
      <td>${titleCase(row.carteira)}</td>
      <td>${row.pi}</td>
      <td>${row.statusResumo ? `<span class="pill bl">${row.statusResumo}</span>` : '<span style="color:var(--t3)">—</span>'}</td>
      <td>${row.dataEnvio ? formatDateLabel(row.dataEnvio) : '—'}</td>
      <td>${pepPill}</td>
    </tr>`;
  }).join('');

  const moreNotice = filtered.length > visible.length
    ? `<tr><td colspan="8" style="color:var(--t2);text-align:center">Mostrando ${fmtNumber(visible.length)} de ${fmtNumber(filtered.length)} — refine os filtros para ver mais.</td></tr>`
    : '';

  tbody.innerHTML = rowsHtml + moreNotice;
}

function pepsGenerateInsights(rows) {
  const insights = [];
  const total = rows.length;
  if (!total) {
    insights.push({ severity: 'low', icon: 'ti-info-circle', title: 'Sem dados para os filtros atuais', desc: 'Ajuste os filtros para gerar insights.' });
    return insights;
  }

  const comPep = rows.filter((row) => row.temPep).length;
  const semPep = total - comPep;
  const semPepRate = semPep / total;

  if (semPepRate >= 0.15) {
    insights.push({ severity: 'high', icon: 'ti-file-off', title: `${fmtNumber(semPep)} notas aptas sem PEP (${(semPepRate * 100).toFixed(1)}%)`, desc: 'Backlog relevante de abertura de PEP — priorize essas notas.' });
  } else if (semPep > 0) {
    insights.push({ severity: 'medium', icon: 'ti-file-off', title: `${fmtNumber(semPep)} notas aptas ainda sem PEP`, desc: `${(semPepRate * 100).toFixed(1)}% do total apto aguardando abertura.` });
  } else {
    insights.push({ severity: 'good', icon: 'ti-circle-check', title: 'Todas as notas aptas já têm PEP', desc: 'Nenhum backlog de abertura no recorte atual.' });
  }

  const carteiraSemPepMap = new Map();
  rows.forEach((row) => { if (!row.temPep) carteiraSemPepMap.set(row.carteira, (carteiraSemPepMap.get(row.carteira) || 0) + 1); });
  const topCarteiraSemPep = Array.from(carteiraSemPepMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCarteiraSemPep && topCarteiraSemPep[1] >= 3) {
    insights.push({ severity: 'medium', icon: 'ti-folder-exclamation', title: `${titleCase(topCarteiraSemPep[0])} concentra ${fmtNumber(topCarteiraSemPep[1])} notas sem PEP`, desc: 'Carteira com maior volume de aberturas pendentes.' });
  }

  const statusMap = new Map();
  rows.forEach((row) => { if (row.statusResumo) statusMap.set(row.statusResumo, (statusMap.get(row.statusResumo) || 0) + 1); });
  const topStatus = Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topStatus && topStatus[0].toUpperCase() !== 'ENCE // ENCE' && topStatus[1] / comPep >= 0.25) {
    insights.push({ severity: 'medium', icon: 'ti-progress-alert', title: `${fmtNumber(topStatus[1])} PEPs concentrados em "${topStatus[0]}"`, desc: 'Possível ponto de represamento no pipeline — vale investigar o gargalo.' });
  }

  const dated = rows.filter(pepsHasValidDate);
  if (dated.length) {
    const mostRecent = dated.reduce((latest, row) => (row.dataEnvio > latest.dataEnvio ? row : latest), dated[0]);
    const daysSince = Math.floor((Date.now() - mostRecent.dataEnvio.getTime()) / 86400000);
    if (daysSince > 14) {
      insights.push({ severity: 'medium', icon: 'ti-calendar-off', title: `Sem novos registros há ${fmtNumber(daysSince)} dias`, desc: `Último registro: ${formatDateLabel(mostRecent.dataEnvio)}.` });
    }
  }

  if (!insights.some((item) => item.severity === 'high')) {
    insights.push({ severity: 'good', icon: 'ti-circle-check', title: 'Nenhum ponto crítico identificado', desc: 'Os indicadores estão dentro da faixa esperada para os filtros atuais.' });
  }

  return insights;
}

function pepsRenderInsights() {
  const container = document.getElementById('peps-insights');
  if (!container) return;
  const insights = pepsGenerateInsights(pepsLastRows);
  container.innerHTML = `
    <div class="insight-card">
      <div class="ch"><div class="ct">Pontos de Atenção — PEP's</div><div class="csub">${fmtNumber(pepsLastRows.length)} notas aptas analisadas</div></div>
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

function pepsToggleInsights() {
  const insightsEl = document.getElementById('peps-insights');
  const bodyEl = document.getElementById('peps-page-body');
  const btn = document.getElementById('peps-insights-toggle');
  if (!insightsEl || !bodyEl || !btn) return;
  const isOn = insightsEl.classList.toggle('on');
  bodyEl.classList.toggle('hidden', isOn);
  btn.classList.toggle('on', isOn);
  btn.innerHTML = isOn
    ? '<i class="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard'
    : '<i class="ti ti-bulb" aria-hidden="true"></i>Insights';
  if (isOn) pepsRenderInsights();
}

function pepsGetExportBundle() {
  const rows = pepsLastRows;
  const comPep = rows.filter((row) => row.temPep).length;
  const periodSelect = document.getElementById('peps-period-select');

  const filtersInfo = [
    ['Modo', pepsState.mode === 'day' ? 'Dia' : pepsState.mode === 'week' ? 'Semana' : 'Mês'],
    ['Período', periodSelect?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Carteira', pepsState.carteira === 'all' ? 'Todas' : titleCase(pepsState.carteira)],
    ['PI', pepsState.pi === 'all' ? 'Todos' : pepsState.pi],
    ['Status Resumo', pepsState.status === 'all' ? 'Todos' : pepsState.status],
    ['Total Aptos', fmtNumber(rows.length)],
    ['Aptos com PEP', fmtNumber(comPep)],
    ['Aptos sem PEP', fmtNumber(rows.length - comPep)],
  ];

  const statusMap = new Map();
  rows.forEach((row) => { if (row.statusResumo) statusMap.set(row.statusResumo, (statusMap.get(row.statusResumo) || 0) + 1); });
  const statusRows = Array.from(statusMap.entries()).map(([status, count]) => ({ 'Status Resumo': status, Registros: count })).sort((a, b) => b.Registros - a.Registros);

  const detailRows = pepsGetExportRows().map((row) => ({
    Nota: row.nota,
    PEP: row.pep,
    Município: titleCase(row.municipio),
    Carteira: titleCase(row.carteira),
    PI: row.pi,
    'Status Resumo': row.statusResumo,
    'Data de Envio': row.dataEnvio ? formatDateLabel(row.dataEnvio) : '',
    'Tem PEP': row.temPep ? 'Sim' : 'Não',
  }));

  return { filtersInfo, statusRows, detailRows };
}

function pepsExportXlsx() {
  if (!window.XLSX) {
    console.error('Biblioteca XLSX não carregada.');
    return;
  }

  const bundle = pepsGetExportBundle();
  if (!bundle.detailRows.length) {
    alert('Nenhum dado disponível para exportar com os filtros atuais.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const resumoSheet = XLSX.utils.aoa_to_sheet([['Campo', 'Valor'], ...bundle.filtersInfo]);
  const statusSheet = XLSX.utils.json_to_sheet(bundle.statusRows);
  const detailSheet = XLSX.utils.json_to_sheet(bundle.detailRows);

  resumoSheet['!cols'] = [{ wch: 22 }, { wch: 26 }];
  statusSheet['!cols'] = [{ wch: 24 }, { wch: 12 }];
  detailSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 14 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, resumoSheet, 'Resumo');
  XLSX.utils.book_append_sheet(wb, statusSheet, 'Status Resumo');
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Registros');

  const fileName = `Cena_PEPs_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName, { compression: true });
}

function pepsUpdateDashboard() {
  if (!pepsRows.length) return;
  pepsUpdateFilterControls();
  pepsLastRows = pepsGetFilteredRows();
  pepsRenderKpis(pepsLastRows);
  pepsRenderTable(pepsLastRows);
  setText('peps-period-range', pepsFormatPeriodRange(pepsLastRows));
  if (typeof rebuildCharts === 'function') rebuildCharts();
  if (document.getElementById('peps-insights')?.classList.contains('on')) pepsRenderInsights();
}

function pepsBindFilters() {
  if (pepsFiltersBound) return;
  pepsFiltersBound = true;

  pepsBindTableColumnFilters();

  document.querySelectorAll('#peps-mode-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pepsState.mode = btn.dataset.mode;
      pepsState.periodKey = '';
      pepsUpdateDashboard();
    });
  });
  document.getElementById('peps-period-select')?.addEventListener('change', (event) => {
    pepsState.periodKey = event.target.value === 'all' ? '' : event.target.value;
    pepsUpdateDashboard();
  });
  document.getElementById('peps-carteira-select')?.addEventListener('change', (event) => {
    pepsState.carteira = event.target.value;
    pepsUpdateDashboard();
  });
  document.getElementById('peps-pi-select')?.addEventListener('change', (event) => {
    pepsState.pi = event.target.value;
    pepsUpdateDashboard();
  });
  document.getElementById('peps-status-select')?.addEventListener('change', (event) => {
    pepsState.status = event.target.value;
    pepsUpdateDashboard();
  });
  document.getElementById('peps-licenciamento-select')?.addEventListener('change', (event) => {
    pepsState.licenciamento = event.target.value;
    pepsUpdateDashboard();
  });
  document.getElementById('peps-nota-input')?.addEventListener('input', (event) => {
    pepsState.nota = event.target.value;
    pepsUpdateDashboard();
  });
  document.querySelectorAll('#peps-funnel-mode-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pepsFunnelMode = btn.dataset.funnelMode;
      document.querySelectorAll('#peps-funnel-mode-seg .seg-btn').forEach((b) => b.classList.toggle('on', b === btn));
      pepsRenderFunnel(pepsLastRows);
    });
  });
  document.getElementById('peps-reset-filters')?.addEventListener('click', () => {
    pepsState.mode = 'month';
    pepsState.periodKey = '';
    pepsState.carteira = 'all';
    pepsState.pi = 'all';
    pepsState.status = 'all';
    pepsState.licenciamento = 'all';
    pepsState.nota = '';
    const notaInput = document.getElementById('peps-nota-input');
    if (notaInput) notaInput.value = '';
    pepsTableFilters.municipio = 'all';
    pepsTableFilters.carteira = 'all';
    pepsTableFilters.pi = 'all';
    pepsTableFilters.status = 'all';
    pepsTableFilters.pep = 'all';
    pepsUpdateDashboard();
  });
  document.getElementById('peps-table-search')?.addEventListener('input', () => pepsRenderTable(pepsLastRows));
  document.getElementById('peps-export-xlsx')?.addEventListener('click', pepsExportXlsx);
  document.getElementById('peps-insights-toggle')?.addEventListener('click', pepsToggleInsights);
}

window.initPeps = async function initPeps() {
  pepsBindFilters();
  try {
    const rows = await window.cgLoadRows();
    pepsRows = extractPepsRows(rows);
    pepsUpdateDashboard();
    setHTML('peps-live-pill', '<div class="live-dot"></div>Atualizado agora');
  } catch (error) {
    console.error("Falha ao carregar a base de PEP's.", error);
    setHTML('peps-live-pill', '<div class="live-dot"></div>Falha ao carregar base ao vivo');
  }
};
