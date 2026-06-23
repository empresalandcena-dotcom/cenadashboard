# Programacao e Producao Diaria

## Objetivo

Estruturar a primeira frente do dashboard com dados reais, indicadores confiaveis e atualizacao recorrente, mantendo a mesma linguagem visual ja aprovada para a CENA.

O foco inicial desta etapa e o bloco de `Programacao / Producao Diaria`, para que ele sirva como base do restante do painel.

## Escopo Inicial

Esta frente deve responder, no minimo, a quatro perguntas operacionais:

1. Quanto foi programado no periodo.
2. Quanto foi efetivamente produzido.
3. Qual equipe, carteira ou municipio esta performando melhor ou pior.
4. Onde estao os gargalos entre programacao, reprogramacao, cancelamento e conclusao.

## Fonte de Dados Recomendada

### Arquivo principal

- `06-PROGRAMACAO.xlsx`

### Complementos desejaveis

- `02_CONTROLE_STATUS.xlsx`
- Google Sheets ou Excel Online como camada online oficial

## Estrutura Minima da Base

Para o dashboard funcionar bem, a base precisa ter colunas estaveis e padronizadas. O ideal e organizar uma tabela unica ou tabelas relacionadas com os seguintes campos:

- `nota`
- `pep`
- `municipio`
- `carteira`
- `equipe`
- `status_programacao`
- `status_pi`
- `data_programada`
- `data_prevista`
- `data_conclusao`
- `semana_programacao`
- `mes_programacao`
- `qtd_postes`
- `qtd_medidores`
- `valor_mao_obra`
- `valor_medido`
- `valor_faturado`
- `responsavel`
- `origem_atualizacao`
- `ultima_atualizacao`

## Regras de Padronizacao

- Cada `nota` deve ter um identificador unico.
- Os nomes de status devem ser fixos e sem variacoes de escrita.
- Datas devem estar em formato de data real, nao texto.
- Valores monetarios devem estar em campos numericos.
- Campos vazios importantes devem ser tratados com regra clara.
- A mesma regra de filtro deve servir para cards, graficos e tabelas.

## Indicadores Prioritarios

### KPIs principais

- Programadas no periodo
- Concluidas no periodo
- Reprogramadas
- Canceladas
- Taxa de conclusao
- Taxa de reprogramacao
- Taxa de cancelamento
- Valor programado
- Valor concluido
- Valor em aberto

### Indicadores gerenciais

- Produtividade por equipe
- Produtividade por semana
- Produtividade por municipio
- Produtividade por carteira
- Media diaria de producao
- Equipes que atingiram meta
- Equipes abaixo da meta
- Backlog operacional
- Aging medio das notas em aberto

### Indicadores de risco

- Notas paradas acima do SLA
- Programacoes sem conclusao no prazo
- Reprogramacoes recorrentes
- Valor represado sem medicao
- Valor medido sem faturamento

## Regras de Calculo Sugeridas

- `Programadas`: quantidade de notas com data programada no periodo filtrado.
- `Concluidas`: quantidade de notas com status concluido.
- `Taxa de conclusao`: concluidas / programadas.
- `Taxa de reprogramacao`: reprogramadas / programadas.
- `Valor concluido`: soma do valor das notas concluidas.
- `Backlog operacional`: notas programadas e nao concluidas.
- `Aging medio`: media de dias entre programacao e data atual para itens abertos.
- `Meta por equipe`: valor ou volume esperado por equipe no periodo.
- `Atingimento da meta`: realizado / meta.

## Visualizacao Recomendada no Dashboard

Para manter a consistencia com a pagina ja criada:

- Cards no topo com KPIs executivos.
- Grafico principal de status da programacao.
- Linha ou barras por semana para mostrar evolucao.
- Comparativo por equipe com meta versus realizado.
- Tabela operacional no rodape com detalhes por nota.
- Filtros globais enxutos: semana, mes, equipe, municipio, carteira e status.

## Caminho de Implantacao

### Fase 1 - Higienizacao da base

- Revisar colunas da planilha.
- Padronizar nomes de status.
- Validar datas, vazios e duplicidades.

### Fase 2 - Modelo de dados

- Definir tabela principal.
- Relacionar programacao com controle de status, se necessario.
- Criar regras unicas para os indicadores.

### Fase 3 - Integracao online

- Escolher Google Sheets ou Excel Online como origem oficial.
- Publicar os dados em formato acessivel ao dashboard.
- Definir frequencia de atualizacao.

### Fase 4 - Dashboard

- Conectar a pagina aos dados reais.
- Substituir dados mockados por consultas reais.
- Validar se todos os numeros batem entre card, grafico e tabela.

### Fase 5 - Governanca

- Definir quem atualiza a base.
- Definir horario de atualizacao.
- Criar checklist de validacao antes de uso gerencial.

## Checklist de Pronto

- Base sem duplicidade critica.
- Status padronizados.
- Datas validas.
- Valores numericos consistentes.
- Indicadores reconciliados.
- Filtros funcionando de ponta a ponta.
- Atualizacao online definida.
- Responsavel pelo dado definido.

## Proximo Passo Recomendado

O melhor proximo passo e abrir a estrutura do `06-PROGRAMACAO.xlsx` e mapear:

- quais abas entram,
- quais colunas sao obrigatorias,
- quais campos precisam ser renomeados,
- quais indicadores ja podem nascer prontos.

Depois disso, a pagina pode ser ligada a uma base real com muito menos retrabalho.

## Modulo de Encerramento (2026-06-23)

### Correcoes aplicadas

1. **Canvas `ch10` duplicado** — O canvas `id="ch10"` era usado tanto pela secao de Programacao (`Valor por Status`) quanto pela de Encerramento (`Envios por Periodo`). O ID duplicado fazia o `document.getElementById` retornar apenas o primeiro elemento, quebrando o grafico de linha de encerramento. Corrigido renomeando o canvas de encerramento para `id="ch11"` (em `cena_dashboard_v2.html`, `encerramento.js` e `repo_remote_check/`).

2. **Resumo por Situacao** — Adicionado um card de resumo logo apos os KPIs principais, exibindo cada `ENCER_SITUAÇÃO` com:
   - Nome da situacao (badge colorido: verde para Obra Faturada, azul para demais)
   - Contagem de notas
   - Percentual do total
   - Valores MO, Medido e Faturado agregados

### Arquivos alterados

- `cena_dashboard_v2.html` — canvas ch10→ch11 + card de resumo por situacao
- `encerramento.js` — mkChart ch10→ch11 + funcao `encRenderResumo()` + chamadas em `encUpdateDashboard()` e `renderEncerramentoCharts()`
- `repo_remote_check/index.html` — mesmas alteracoes do HTML
- `repo_remote_check/encerramento.js` — mesmas alteracoes do JS
