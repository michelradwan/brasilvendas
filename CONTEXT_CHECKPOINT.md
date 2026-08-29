# RADWAN ADS — MASTER SYSTEM SNAPSHOT & CONTEXT CHECKPOINT
**Data/Hora do Snapshot:** 29/08/2026 às 19:08 (Horário de Brasília)
**Status do Projeto:** 100% Salvo, Commitado no Git e Publicado na Vercel (Produção).

---

## 1. Status do Repositório & Deploy
* **Branch:** `main` (Up to date com `origin/main`)
* **Último Commit:** `9908d56` — *fix(insights): canonical insight model, strict purchase deduplication, AdsActionStats parser, weighted aggregation and complete historical Meta fields*
* **Commit Anterior:** `8e8e76c` — *feat(metrics): complete metrics registry, customizable column manager drawer, native presets and saved views*
* **Ambiente de Produção Ativo:** `https://brasilvendas.vercel.app/admin-ads`

---

## 2. O que foi Concluído e Blindado com Sucesso

### A. Metrics & Columns Master System
* **`js/metrics-registry.js`:**
  - Catálogo completo de 50+ métricas organizadas em 11 categorias formais.
  - 10 Presets nativos profissionais: `PADRAO_GESTOR`, `ESSENCIAL`, `TRAFEGO`, `CONVERSAO`, `FINANCEIRO`, `FUNIL`, `VIDEO`, `CRIATIVOS`, `RADWAN`, `COMPLETO`.
  - Formatadores determinísticos à prova de `NaN`, `Infinity`, `null`, `undefined`.
  - Sistema de visões personalizadas (`UserViewRepository`) persistidas no `localStorage`.
* **`admin-ads.html`:**
  - Botão `[📊 Colunas]` com contador dinâmico de colunas ativas.
  - Drawer deslizante com busca em tempo real, seleção por checkbox e reordenação (▲/▼/✕).
  - Modal de inspeção mobile com visualização em lista limpa.
  - Alternador de densidade de tabela (`[📐]`) com modo Compacto/Confortável.
* **`assets/admin-ads.css`:**
  - Estilos de drawer escuro, tags de proveniência (`Meta`, `Real`, `Radwan`, `Fórmula`), cabeçalhos com suporte a sticky horizontal e ordenação visual (`.sortable-th`).

### B. Canonical Insight Model & Resolução Histórica da Meta
* **`js/meta-adapter.js`:**
  - Parâmetro `fields` expandido na chamada `getInsights()` para incluir todos os campos históricos necessários:
    `spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,action_values,video_30_sec_watched_actions,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions`.
  - Suporte resiliente a `date_preset` e `time_range` customizado.
* **`js/analytics.js`:**
  - **Canonical Insight Model (v2.0):** Fonte da verdade centralizada em `snake_case` com getters de retrocompatibilidade para código legado.
  - **Anti-Double-Count Estrito:** Resolução hierárquica única de compras (`purchase` > `omni_purchase` > `offsite_conversion.fb_pixel_purchase`) e faturamento em `action_values`, impedindo duplicação de conversões.
  - **AdsActionStats Parser:** Extração segura de eventos e contagens de vídeo, preservando `null` em anúncios de imagem sem vídeo (sem inventar zero falso nem estimativas artificiais).
  - **Agregação Ponderada (`aggregateInsights`):** Proibição de média de taxas. CPM, CTR, CPC, Link CTR, Link CPC, CPA e ROAS consolidados são calculados estritamente sobre a soma dos componentes base.
  - **Proteção de Alcance:** `reach` e `frequency` permanecem `null` ao agregar múltiplas entidades para evitar soma inválida de alcance único.
* **`js/dashboard.js`:**
  - Overview Command Center atualizado com agregação canônica em tempo real para os KPIs executivos (Investimento, Faturamento, Lucro Líquido, ROAS, CPA, Vendas, CTR e CPC de Tráfego).
  - Renderização dinâmica de tabela de campanhas conectada ao `metrics-registry.js` e ordenação por qualquer coluna.

---

## 3. Resultados dos Testes Automatizados
* **Suite Executada:** 29 testes automatizados via Node.js
* **Aprovação:** **29 PASS / 0 FAIL (100% de aprovação)**
* **Itens Verificados:** Parser, Deduplicação de conversões, Agregação de taxas ponderadas, Preservação de `null` vs `0`, Adaptador de períodos da Meta.

---

## 4. Próximos Passos (Para Retomada Futura)
Toda a base central do console de métricas, colunas e dados históricos está 100% funcional e consolidada no GitHub e na Vercel. Qualquer reinício de sessão pode prosseguir diretamente deste ponto seguro sem nenhuma perda.
