# CHECKPOINT MASTER DE CONTEXTO & MEMÓRIA CONTÍNUA (BRASIL VENDAS)

**ID da Conversa:** `0309f06b-ef41-46f4-b08c-a82e50e0eedc`  
**Última Atualização:** 24/08/2026 - 00:02  
**Repositório Ativo:** `C:\Users\Michel\.gemini\antigravity-ide\scratch\brasilvendas`  
**Branch:** `main` (Sincronizada no GitHub: `https://github.com/michelradwan/brasilvendas.git`)  
**Restore Point Git Tag:** `restore-point-real-data-audit`  

---

## 📌 1. DIRETRIZES FUNDAMENTAIS & REGRAS ABSOLUTAS DO PROJETO
1. **REAL DATA ONLY (Zero Mock / Zero Fake Data):**
   - NUNCA gerar automaticamente pedidos, visitantes, sessões, PIX ou receita fictícia em produção.
   - Se o banco de dados estiver vazio, a interface deve exibir `0` ou `NO DATA` (Empty State legítimo).
   - Testes automatizados executam isolados e nunca deixam resíduos no storage de produção.
2. **FAIL-OPEN NO SITE INTELLIGENCE:**
   - O módulo Site Intelligence é 100% observacional e passivo (`<4KB`). Qualquer erro nele morre silenciosamente e jamais bloqueia o checkout ou as vendas.
   - **Zero PII:** Proibido armazenar CPF, nome, e-mail, telefone, endereço ou dados de cartão nos eventos de comportamento.
3. **DESIGN SYSTEM SUPREMO (Black + Graphite + Accent Red):**
   - Zero emojis como ícones de interface; usar exclusivamente **SVGs Lucide inline** vetorizados.
   - Densidade de interface 1080p Full HD coesa (sem itens gigantes ou miniaturizados).

---

## 📁 2. ARQUIVOS CHAVE DO PROJETO & ESTRUTURA

### Frontend & Painéis
- [`admin-ads.html`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/admin-ads.html): **Meta Ads Command Center** (Snapshot Executivo, Campanhas, Criativos, Funil, Site Intelligence, Tracking Health, Autopilot).
- [`admin.html`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/admin.html): **Gestão de Pedidos (Order Operations)** (Monitor de Visitantes em Tempo Real + Tabela de Pedidos com botão de Limpeza de Histórico).
- [`index.html`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/index.html): **Landing Page Oficial** do Kit Patriota 2026 com scripts de tracking, heartbeat com deduplicação por `localStorage` (`bv_visitor_id`) e tracker passivo do SI.
- [`js/dashboard.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/js/dashboard.js): Controlador do dashboard do Command Center, carregamento assíncrono do Site Intelligence (`loadSIData`) e cálculos de saúde da conta.

### Backend & APIs (Vercel Serverless)
- [`api/pedidos.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/api/pedidos.js): Fonte canônica exclusiva de pedidos com suporte a `clearStore('actions')`.
- [`api/visitantes.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/api/visitantes.js): Monitor de visitantes com TTL de 25s e atualização idempotente de heartbeat (1 navegador = 1 visitante).
- [`api/tracking-gateway.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/api/tracking-gateway.js): Gateway de atribuição durável, Meta CAPI v21.0 com hash SHA-256 e UTMify.
- [`api/gerar-pix.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/api/gerar-pix.js): Endpoint de criação de PIX via gateway Duttyfy protegido com validação de order bumps.
- [`api/si-collect.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/api/si-collect.js) & [`api/si-query.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/api/si-query.js): Ingestão e consulta do Site Intelligence.

### Módulo Site Intelligence (`site-intelligence/`)
- [`client/si-schema.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/client/si-schema.js): Schema canônico com sanitizador PII irrestrito.
- [`client/si-tracker.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/client/si-tracker.js): Tracker cliente assíncrono com detecção de Rage Click e Dead Click.
- [`server/session-engine.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/server/session-engine.js): Reconstituição de sessões.
- [`server/funnel-engine.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/server/funnel-engine.js): Mapeamento de drop-off.
- [`server/friction-engine.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/server/friction-engine.js): Mapeamento de fricção por seletor.
- [`server/bottleneck-engine.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/server/bottleneck-engine.js): Detector matemático de gargalo.
- [`server/ai-diagnosis.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/site-intelligence/server/ai-diagnosis.js): Diagnóstico baseado em evidências reais.

### Persistência & Storage
- [`lib/storage-adapter.js`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/lib/storage-adapter.js): Adapter com `clearStore`, isolamento de testes e persistência em [`storage/meta-state.json`](file:///C:/Users/Michel/.gemini/antigravity-ide/scratch/brasilvendas/storage/meta-state.json).

---

## 🧪 3. SUITES DE TESTES AUTOMATIZADOS (STATUS: 100% PASS)
Execute os comandos abaixo a qualquer momento para validar a integridade completa do sistema:

```bash
# 1. Suite de Tracking e Atribuição Durável (8 Testes)
node tests/tracking-attribution.test.js

# 2. Bateria de Testes de Geração de PIX (5 Cenários Reais)
node C:\Users\vanny\.gemini\antigravity-ide\brain\d9ef433e-9b20-40d7-8351-a0e785c211b4\scratch\test-all-pix-scenarios.js

# 3. Master Suite de Governança e Guardrails Ads (25 Testes)
node tests/test-suite-complete.js

# 4. Suite do Módulo Site Intelligence (5 Testes)
node site-intelligence/tests/si-tests.js
```

---

## ⚡ 4. ARQUITETURA DE RASTREAMENTO AVANÇADO (5 PRO TRACKING HACKS)
1. **CAPI Server-Side Intent Priming na Etapa 1:** Disparo assíncrono passivo de `InitiateCheckout` via CAPI assim que o cliente valida Nome + CPF + WhatsApp na Etapa 1 do formulário (antes de gerar o PIX), alimentando o algoritmo de Lookalike do Meta com dados criptografados em SHA-256.
2. **Sinalização Dinâmica de High Ticket:** Disparo de valores dinâmicos reais (`InitiateCheckout` e `AddPaymentInfo`) calculados com Order Bumps e quantidades de kits para orientar a entrega do Meta a compradores com maior poder de compra (*Value Optimization*).
3. **Evento Customizado `HighIntentVisitor`:** Tracker de engajamento que dispara `fbq('trackCustom', 'HighIntentVisitor')` quando o visitante permanece >35 segundos na página e navega por >60% do conteúdo.
4. **Injeção & Normalização Estrita do Cookie `_fbc`:** Geração manual do cookie `_fbc` no formato canônico da Meta (`fb.1.${timestamp}.${fbclid}`) para navegações em dispositivos iOS 14.5+ / Safari ITP.
5. **Suporte a Multi-Pixel de Backup:** Suporte a `SECONDARY_META_PIXEL_ID` (frontend) e `META_BACKUP_PIXEL_ID` (backend CAPI) para espelhar eventos de conversão e manter redundância total de dados.

---

## 📋 5. PRÓXIMOS PASSOS PARA A PRÓXIMA SESSÃO
1. Acompanhar a ingestão dos primeiros dados reais de navegação de visitantes na aba **Site Intelligence**.
2. Monitorar no Meta Events Manager a pontuação de qualidade de correspondência (Event Quality Match) dos eventos de Purchase e InitiateCheckout enviados via CAPI.
3. Avaliar a performance dos criativos no Command Center conforme o tráfego for entregue.
