# Changelog — Dashboard CENA

## 2026-06-23

### Encerramento
- **Cascata Status Resumo**: gráfico waterfall (ch12) com acúmulo por `STATUS RESUMO`, filtra `ENCER_SITUAÇÃO <> "-"` igual ao Power BI
- **Colunas R$ (ch13)**: gráfico de barras agrupadas com MO, Medido e Faturado por status, visível no modo tela cheia abaixo da cascata
- **Valores R$ verticais**: labels girados -90° com offset de 38px acima das barras, fonte 12px (18px no destaque via escala 1.5x)
- **Total dentro da barra**: na cascata (ch13), apenas a coluna Total tem valor colado (4px), os demais status ficam distantes
- **Situação de Encerramento (ch8)**: mesmo formato — R$ vertical, 12px, 38px offset
- **Eixo X**: fonte padrão 11px em todos os gráficos

### Tela Cheia (Modo Destaque)
- Ícone de expandir no canto direito de cada card
- Move o card real para painel overlay (charts mantidos vivos)
- Ao fechar: destrói e reconstrói charts para evitar bug de crescimento
- Fecha por ESC, clique no fundo ou botão X
- Fontes R$ escalam 1.5x automaticamente no destaque

### Correção de Dados
- `toNum()` substitui `typeof === 'number'` — converte strings para número (`Number()`), igual ao `VALUE()` do Power BI
- Aplicado em `encerramento.js` e `peps.js`

### Geral
- Usuário no topbar: "Gestor de Dados / CENA Engenharia" (antes "Anna Adame / Coordenadora")
- `.gitignore`: node_modules/, repo_remote_check/, __pycache__/
- `index.html` renomeado de `cena_dashboard_v2.html`
