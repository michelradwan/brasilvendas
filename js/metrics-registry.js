// ==============================================================================
// RADWAN ADS — METRIC REGISTRY & COLUMNS MASTER ENGINE (v1.0)
// Centralized Single Source of Truth • Safe Math • Native Presets • Saved Views
// ==============================================================================

(function(window) {
    'use strict';

    // ─── 1. CATEGORIAS OFICIAIS DE MÉTRICAS ────────────────────────────────────

    const METRIC_CATEGORIES = [
        { id: 'principais', label: 'Principais', icon: '⭐', description: 'Visão executiva essencial para tomada de decisão' },
        { id: 'entrega', label: 'Entrega & Alcance', icon: '📡', description: 'Distribuição, impressões, CPM e frequência' },
        { id: 'trafego', label: 'Tráfego & Cliques', icon: '🔗', description: 'Cliques no link, CPC, CTR e visitas à página' },
        { id: 'conversao', label: 'Conversão & Vendas', icon: '🛒', description: 'Compras, checkouts, leads e custos por evento' },
        { id: 'financeiro', label: 'Financeiro & Retorno', icon: '💰', description: 'ROAS real, faturamento, margem e lucro líquido' },
        { id: 'funil', label: 'Funil de Vendas', icon: '📊', description: 'Taxas de passagem entre etapas do funil' },
        { id: 'video', label: 'Vídeo & Retenção', icon: '🎬', description: 'Taxa de retenção inicial (Hook Rate), ThruPlay e quartis' },
        { id: 'criativo', label: 'Criativos', icon: '🎨', description: 'Atributos e fadiga de criativos' },
        { id: 'qualidade', label: 'Qualidade & Relevância', icon: '🏷️', description: 'Diagnósticos de relevância e experiência' },
        { id: 'radwan', label: 'Inteligência Radwan', icon: '⌘', description: 'Power Score, prontidão para escala e desvio de metas' },
        { id: 'avancadas', label: 'Avançadas & IDs', icon: '⚙️', description: 'Identificadores técnicos, objetivos e configurações' }
    ];

    // ─── 2. CATÁLOGO COMPLETO DE MÉTRICAS (METRIC REGISTRY) ───────────────────

    const METRIC_REGISTRY = {
        // --- CONTROLES DE LINHA ---
        'status_toggle': {
            id: 'status_toggle',
            label: 'Status',
            shortLabel: 'Status',
            category: 'principais',
            source: 'META_RAW',
            sourceField: 'status',
            format: 'status_toggle',
            align: 'center',
            minWidth: 64,
            sortable: true,
            higherIsBetter: null,
            tooltip: 'Status de veiculação da campanha (Ativa / Pausada com Write-Read-Verify)',
            beginnerDescription: 'Liga ou desliga a campanha na Meta.',
            requiresFields: ['status'],
            calculate: (ins, camp) => camp?.status || 'PAUSED'
        },

        'name': {
            id: 'name',
            label: 'Campanha',
            shortLabel: 'Nome',
            category: 'principais',
            source: 'META_RAW',
            sourceField: 'name',
            format: 'entity_name',
            align: 'left',
            minWidth: 220,
            sortable: true,
            higherIsBetter: null,
            tooltip: 'Nome da campanha e identificador único de veiculação',
            beginnerDescription: 'Identificação da campanha na conta.',
            requiresFields: ['name', 'id', 'daily_budget', 'lifetime_budget'],
            calculate: (ins, camp) => ({
                id: camp?.id || '',
                name: camp?.name || 'Campanha',
                isCBO: !!(camp?.daily_budget || camp?.lifetime_budget)
            })
        },

        'daily_budget': {
            id: 'daily_budget',
            label: 'Orçamento Diário',
            shortLabel: 'Orçamento',
            category: 'principais',
            source: 'META_RAW',
            sourceField: 'daily_budget',
            format: 'currency_editable',
            align: 'right',
            minWidth: 120,
            sortable: true,
            higherIsBetter: null,
            tooltip: 'Limite diário de investimento configurado no nível de campanha (CBO) ou conjunto (ABO)',
            beginnerDescription: 'Valor máximo diário programado para ser gasto.',
            requiresFields: ['daily_budget', 'lifetime_budget'],
            calculate: (ins, camp) => {
                if (camp?.daily_budget) return parseFloat(camp.daily_budget) / 100;
                if (camp?.lifetime_budget) return parseFloat(camp.lifetime_budget) / 100;
                return 0;
            }
        },

        // --- MÉTRICAS PRINCIPAIS ---
        'spend': {
            id: 'spend',
            label: 'Investimento',
            shortLabel: 'Gasto',
            category: 'principais',
            source: 'META_RAW',
            sourceField: 'spend',
            format: 'currency',
            align: 'right',
            minWidth: 110,
            sortable: true,
            higherIsBetter: null,
            tooltip: 'Valor financeiro total consumido no período selecionado',
            beginnerDescription: 'Total em reais gasto com anúncios.',
            requiresFields: ['spend'],
            calculate: (ins) => ins?.spend || 0
        },

        'purchases': {
            id: 'purchases',
            label: 'Compras (Meta)',
            shortLabel: 'Compras',
            category: 'principais',
            source: 'META_ACTION',
            sourceField: 'actions',
            format: 'integer',
            align: 'right',
            minWidth: 90,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Quantidade de conversões de compra atribuídas pelo pixel da Meta no período',
            beginnerDescription: 'Número de compras registradas pelos anúncios.',
            requiresFields: ['actions'],
            calculate: (ins) => ins?.purchases || 0
        },

        'cpa': {
            id: 'cpa',
            label: 'Custo por Compra (CPA)',
            shortLabel: 'CPA',
            category: 'principais',
            source: 'DERIVED',
            sourceField: 'spend,actions',
            format: 'currency',
            align: 'right',
            minWidth: 100,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Investimento dividido pelo número de compras atribuídas (Gasto / Compras)',
            beginnerDescription: 'Quanto você pagou em média por cada venda realizada.',
            requiresFields: ['spend', 'actions'],
            calculate: (ins) => {
                if (!ins || !ins.purchases || ins.purchases <= 0) return null;
                return ins.spend / ins.purchases;
            }
        },

        'revenue': {
            id: 'revenue',
            label: 'Faturamento Atribuído',
            shortLabel: 'Receita',
            category: 'principais',
            source: 'META_ACTION',
            sourceField: 'action_values',
            format: 'currency',
            align: 'right',
            minWidth: 110,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Valor monetário bruto das compras atribuídas pela Meta Ads',
            beginnerDescription: 'Total em vendas atribuído aos seus anúncios.',
            requiresFields: ['action_values'],
            calculate: (ins) => ins?.revenue || 0
        },

        'roas': {
            id: 'roas',
            label: 'ROAS da Meta',
            shortLabel: 'ROAS',
            category: 'principais',
            source: 'DERIVED',
            sourceField: 'spend,action_values',
            format: 'ratio',
            align: 'right',
            minWidth: 90,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Retorno sobre investimento em anúncios (Receita Atribuída / Gasto)',
            beginnerDescription: 'Quantas vezes o valor investido retornou em vendas.',
            requiresFields: ['spend', 'action_values'],
            calculate: (ins) => {
                if (!ins || !ins.spend || ins.spend <= 0) return null;
                return ins.revenue / ins.spend;
            }
        },

        'profit': {
            id: 'profit',
            label: 'Lucro Líquido Real',
            shortLabel: 'Lucro',
            category: 'financeiro',
            source: 'ECONOMICS',
            sourceField: 'spend,action_values',
            format: 'currency_colored',
            align: 'right',
            minWidth: 110,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Faturamento menos investimento em anúncios e custos operacionais/CMV estimados (Margem líquida)',
            beginnerDescription: 'O dinheiro real que sobrou no seu bolso após pagar anúncios e produto.',
            requiresFields: ['spend', 'action_values'],
            calculate: (ins) => {
                if (!ins) return 0;
                const rev = ins.revenue || 0;
                const spend = ins.spend || 0;
                // Estimativa de CMV/Custos = 35% do faturamento
                const cmv = rev * 0.35;
                return rev - spend - cmv;
            }
        },

        'margin': {
            id: 'margin',
            label: 'Margem Líquida',
            shortLabel: 'Margem %',
            category: 'financeiro',
            source: 'ECONOMICS',
            sourceField: 'spend,action_values',
            format: 'percentage',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Percentual de lucro em relação ao faturamento total (Lucro / Receita)',
            beginnerDescription: 'A porcentagem de cada venda que vira lucro líquido.',
            requiresFields: ['spend', 'action_values'],
            calculate: (ins) => {
                if (!ins || !ins.revenue || ins.revenue <= 0) return null;
                const profit = (ins.revenue * 0.65) - (ins.spend || 0);
                return (profit / ins.revenue) * 100;
            }
        },

        // --- ENTREGA & ALCANCE ---
        'impressions': {
            id: 'impressions',
            label: 'Impressões',
            shortLabel: 'Impressões',
            category: 'entrega',
            source: 'META_RAW',
            sourceField: 'impressions',
            format: 'integer',
            align: 'right',
            minWidth: 100,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Número total de vezes que os anúncios foram exibidos na tela dos usuários',
            beginnerDescription: 'Quantas vezes seu anúncio apareceu.',
            requiresFields: ['impressions'],
            calculate: (ins) => ins?.impressions || 0
        },

        'reach': {
            id: 'reach',
            label: 'Alcance Único',
            shortLabel: 'Alcance',
            category: 'entrega',
            source: 'META_RAW',
            sourceField: 'reach',
            format: 'integer',
            align: 'right',
            minWidth: 100,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Número de pessoas únicas que visualizaram os anúncios pelo menos uma vez',
            beginnerDescription: 'Pessoas diferentes que viram o anúncio.',
            requiresFields: ['reach'],
            calculate: (ins) => ins?.reach !== undefined && ins?.reach !== null ? ins.reach : null
        },

        'frequency': {
            id: 'frequency',
            label: 'Frequência',
            shortLabel: 'Freq.',
            category: 'entrega',
            source: 'RADWAN_DERIVED',
            sourceField: 'impressions,reach',
            format: 'decimal_2',
            align: 'right',
            minWidth: 80,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Média de vezes que cada pessoa viu o anúncio (Impressões / Alcance)',
            beginnerDescription: 'Quantas vezes a mesma pessoa viu seu anúncio em média.',
            requiresFields: ['impressions', 'reach'],
            calculate: (ins) => {
                if (ins?.frequency !== undefined && ins?.frequency !== null) return ins.frequency;
                if (!ins || !ins.reach || ins.reach <= 0) return null;
                return ins.impressions / ins.reach;
            }
        },

        'cpm': {
            id: 'cpm',
            label: 'Custo por Mil (CPM)',
            shortLabel: 'CPM',
            category: 'entrega',
            source: 'RADWAN_DERIVED',
            sourceField: 'spend,impressions',
            format: 'currency',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Custo médio para exibir o anúncio 1.000 vezes ((Gasto / Impressões) * 1000)',
            beginnerDescription: 'Quanto custa para 1.000 pessoas verem seu anúncio.',
            requiresFields: ['spend', 'impressions'],
            calculate: (ins) => {
                if (ins?.cpm !== undefined && ins?.cpm !== null) return ins.cpm;
                if (!ins || !ins.impressions || ins.impressions <= 0) return null;
                return (ins.spend / ins.impressions) * 1000;
            }
        },

        // --- TRÁFEGO & CLIQUES ---
        'link_clicks': {
            id: 'link_clicks',
            label: 'Cliques no Link',
            shortLabel: 'Cliques Link',
            category: 'trafego',
            source: 'META_ACTION',
            sourceField: 'inline_link_clicks',
            format: 'integer',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Cliques específicos no link de destino direcionando para o site',
            beginnerDescription: 'Pessoas que clicaram no link para abrir sua loja.',
            requiresFields: ['inline_link_clicks', 'clicks'],
            calculate: (ins) => ins?.link_clicks !== undefined && ins?.link_clicks !== null ? ins.link_clicks : (ins?.clicks || 0)
        },

        'link_ctr': {
            id: 'link_ctr',
            label: 'CTR do Link',
            shortLabel: 'CTR Link',
            category: 'trafego',
            source: 'RADWAN_DERIVED',
            sourceField: 'inline_link_clicks,impressions',
            format: 'percentage',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Percentual de impressões que resultaram em clique no link ((Cliques Link / Impressões) * 100)',
            beginnerDescription: 'Porcentagem de pessoas que clicaram no link após verem o anúncio.',
            requiresFields: ['inline_link_clicks', 'impressions'],
            calculate: (ins) => {
                if (ins?.link_ctr !== undefined && ins?.link_ctr !== null) return ins.link_ctr;
                const clicks = ins?.link_clicks !== undefined && ins?.link_clicks !== null ? ins.link_clicks : (ins?.clicks || 0);
                if (!ins || !ins.impressions || ins.impressions <= 0) return null;
                return (clicks / ins.impressions) * 100;
            }
        },

        'link_cpc': {
            id: 'link_cpc',
            label: 'CPC do Link',
            shortLabel: 'CPC Link',
            category: 'trafego',
            source: 'RADWAN_DERIVED',
            sourceField: 'spend,inline_link_clicks',
            format: 'currency',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Custo médio por clique no link de destino (Gasto / Cliques no Link)',
            beginnerDescription: 'Quanto você pagou por cada visita ao seu link.',
            requiresFields: ['spend', 'inline_link_clicks'],
            calculate: (ins) => {
                if (ins?.link_cpc !== undefined && ins?.link_cpc !== null) return ins.link_cpc;
                const clicks = ins?.link_clicks !== undefined && ins?.link_clicks !== null ? ins.link_clicks : (ins?.clicks || 0);
                if (!ins || clicks <= 0) return null;
                return ins.spend / clicks;
            }
        },

        'landing_page_views': {
            id: 'landing_page_views',
            label: 'Visualizações da Página',
            shortLabel: 'Visitas Página',
            category: 'trafego',
            source: 'META_ACTION',
            sourceField: 'actions',
            format: 'integer',
            align: 'right',
            minWidth: 100,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Usuários que clicaram e aguardaram o carregamento completo da página de destino',
            beginnerDescription: 'Pessoas que realmente abriram sua página até carregar.',
            requiresFields: ['actions'],
            calculate: (ins) => ins?.landing_page_views !== undefined && ins?.landing_page_views !== null ? ins.landing_page_views : null
        },

        'cost_per_lpv': {
            id: 'cost_per_lpv',
            label: 'Custo por Visita à Página',
            shortLabel: 'Custo/Visita',
            category: 'trafego',
            source: 'RADWAN_DERIVED',
            sourceField: 'spend,actions',
            format: 'currency',
            align: 'right',
            minWidth: 100,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Gasto total dividido pelas visualizações reais da página de destino',
            beginnerDescription: 'Custo para levar uma pessoa real até sua página.',
            requiresFields: ['spend', 'actions'],
            calculate: (ins) => {
                const lpv = ins?.landing_page_views;
                if (!ins || lpv === null || lpv === undefined || lpv <= 0) return null;
                return ins.spend / lpv;
            }
        },

        // --- CONVERSÃO & FUNIL ---
        'initiate_checkout': {
            id: 'initiate_checkout',
            label: 'Checkouts Iniciados',
            shortLabel: 'Checkouts',
            category: 'conversao',
            source: 'META_ACTION',
            sourceField: 'actions',
            format: 'integer',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Quantidade de pessoas que iniciaram o fluxo de pagamento/checkout',
            beginnerDescription: 'Quantos clientes chegaram na tela de pagamento.',
            requiresFields: ['actions'],
            calculate: (ins) => ins?.initiate_checkout !== undefined && ins?.initiate_checkout !== null ? ins.initiate_checkout : null
        },

        'cost_per_initiate_checkout': {
            id: 'cost_per_initiate_checkout',
            label: 'Custo por Checkout Iniciado',
            shortLabel: 'Custo/Checkout',
            category: 'conversao',
            source: 'RADWAN_DERIVED',
            sourceField: 'spend,actions',
            format: 'currency',
            align: 'right',
            minWidth: 105,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Investimento total dividido pelo número de checkouts iniciados',
            beginnerDescription: 'Quanto custou para colocar um cliente no checkout.',
            requiresFields: ['spend', 'actions'],
            calculate: (ins) => {
                const ic = ins?.initiate_checkout;
                if (!ins || ic === null || ic === undefined || ic <= 0) return null;
                return ins.spend / ic;
            }
        },

        'add_to_cart': {
            id: 'add_to_cart',
            label: 'Adições ao Carrinho',
            shortLabel: 'Carrinhos',
            category: 'conversao',
            source: 'META_ACTION',
            sourceField: 'actions',
            format: 'integer',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Número de adições de produtos ao carrinho de compras',
            beginnerDescription: 'Pessoas que colocaram produtos no carrinho.',
            requiresFields: ['actions'],
            calculate: (ins) => ins?.add_to_cart !== undefined && ins?.add_to_cart !== null ? ins.add_to_cart : null
        },

        'conversion_rate': {
            id: 'conversion_rate',
            label: 'Taxa de Conversão (CVR)',
            shortLabel: 'Taxa Conv.',
            category: 'conversao',
            source: 'RADWAN_DERIVED',
            sourceField: 'actions,clicks',
            format: 'percentage',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Percentual de cliques que se transformaram em compras pagas ((Compras / Cliques) * 100)',
            beginnerDescription: 'A cada 100 cliques, quantos viraram compradores.',
            requiresFields: ['actions', 'clicks'],
            calculate: (ins) => {
                const clicks = ins?.link_clicks !== undefined && ins?.link_clicks !== null ? ins.link_clicks : (ins?.clicks || 0);
                if (!ins || clicks <= 0 || !ins.purchases) return null;
                return (ins.purchases / clicks) * 100;
            }
        },

        'funnel_checkout_to_purchase': {
            id: 'funnel_checkout_to_purchase',
            label: 'Conversão Checkout ➔ Compra',
            shortLabel: 'Conv. Checkout',
            category: 'funil',
            source: 'RADWAN_DERIVED',
            sourceField: 'actions',
            format: 'percentage',
            align: 'right',
            minWidth: 110,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Percentual de checkouts que foram concluídos com sucesso e pagamento compensado',
            beginnerDescription: 'De quem entrou no checkout, quantos realmente pagaram.',
            requiresFields: ['actions'],
            calculate: (ins) => {
                const ic = ins?.initiate_checkout;
                if (!ins || ic === null || ic === undefined || ic <= 0 || !ins.purchases) return null;
                return Math.min(100, (ins.purchases / ic) * 100);
            }
        },

        // --- VÍDEO & RETENÇÃO ---
        'video_views_3s': {
            id: 'video_views_3s',
            label: 'Reproduções de 3 Segundos',
            shortLabel: 'Views 3s',
            category: 'video',
            source: 'META_ACTION',
            sourceField: 'video_30_sec_watched_actions',
            format: 'integer',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Reproduções do vídeo com pelo menos 3 segundos de exibição contínua',
            beginnerDescription: 'Pessoas que assistiram pelo menos 3 segundos do seu vídeo.',
            requiresFields: ['video_30_sec_watched_actions', 'impressions'],
            calculate: (ins) => ins?.video_views_3s !== undefined && ins?.video_views_3s !== null ? ins.video_views_3s : null
        },

        'hook_rate': {
            id: 'hook_rate',
            label: 'Retenção Inicial (Hook Rate)',
            shortLabel: 'Hook Rate',
            category: 'video',
            source: 'RADWAN_DERIVED',
            sourceField: 'video_30_sec_watched_actions,impressions',
            format: 'percentage',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Taxa de captura do gancho inicial ((Reproduções 3s / Impressões) * 100) — RADWAN DERIVED',
            beginnerDescription: 'Poder do gancho inicial para prender a atenção no feed.',
            requiresFields: ['video_30_sec_watched_actions', 'impressions'],
            calculate: (ins) => {
                if (!ins || !ins.impressions || ins.impressions <= 0 || ins.video_views_3s === null || ins.video_views_3s === undefined) return null;
                return (ins.video_views_3s / ins.impressions) * 100;
            }
        },

        'thruplay': {
            id: 'thruplay',
            label: 'ThruPlays (15s/Total)',
            shortLabel: 'ThruPlay',
            category: 'video',
            source: 'META_ACTION',
            sourceField: 'video_thruplay_watched_actions',
            format: 'integer',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Reproduções completas de vídeos curtos ou de pelo menos 15 segundos',
            beginnerDescription: 'Visualizações de alta retenção no vídeo.',
            requiresFields: ['video_thruplay_watched_actions'],
            calculate: (ins) => ins?.thruplay !== undefined && ins?.thruplay !== null ? ins.thruplay : null
        },

        'cost_per_thruplay': {
            id: 'cost_per_thruplay',
            label: 'Custo por ThruPlay',
            shortLabel: 'Custo/ThruPlay',
            category: 'video',
            source: 'RADWAN_DERIVED',
            sourceField: 'spend,video_thruplay_watched_actions',
            format: 'currency',
            align: 'right',
            minWidth: 100,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Investimento total dividido pela quantidade de ThruPlays obtidos',
            beginnerDescription: 'Quanto você pagou por cada visualização engajada de vídeo.',
            requiresFields: ['spend', 'video_thruplay_watched_actions'],
            calculate: (ins) => {
                const tp = ins?.thruplay;
                if (!ins || tp === null || tp === undefined || tp <= 0) return null;
                return ins.spend / tp;
            }
        },

        'video_p100': {
            id: 'video_p100',
            label: 'Vídeo 100% Assistido',
            shortLabel: 'Vídeo 100%',
            category: 'video',
            source: 'META_ACTION',
            sourceField: 'video_p100_watched_actions',
            format: 'integer',
            align: 'right',
            minWidth: 95,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Número de vezes que o vídeo foi assistido integralmente até o fim',
            beginnerDescription: 'Pessoas que assistiram o vídeo inteiro até o final.',
            requiresFields: ['video_p100_watched_actions'],
            calculate: (ins) => ins?.video_p100 !== undefined && ins?.video_p100 !== null ? ins.video_p100 : null
        },

        // --- INTELIGÊNCIA RADWAN ---
        'radwan_status': {
            id: 'radwan_status',
            label: 'Estado Radwan',
            shortLabel: 'Estado',
            category: 'radwan',
            source: 'RADWAN',
            sourceField: 'decision_engine',
            format: 'radwan_badge',
            align: 'center',
            minWidth: 130,
            sortable: true,
            higherIsBetter: null,
            tooltip: 'Classificação algorítmica de performance do Radwan Ads (Winner, Normal, Observação, Fadiga)',
            beginnerDescription: 'Diagnóstico inteligente do estado atual da campanha.',
            requiresFields: ['spend', 'actions', 'action_values'],
            calculate: (ins) => {
                if (!window.decisionEngine) return { classification: 'NORMAL', label: 'Saudável', score: 70 };
                const evalRes = window.decisionEngine.evaluateCreative(ins, 35.00);
                let label = 'Saudável';
                if (evalRes.classification === 'WINNER') label = 'Pronta p/ Escalar';
                else if (evalRes.classification === 'FATIGUE') label = 'Requer Atenção';
                else if (evalRes.classification === 'WATCH') label = 'Observando';
                return { classification: evalRes.classification, label, score: evalRes.score || 70 };
            }
        },

        'radwan_score': {
            id: 'radwan_score',
            label: 'Power Score Radwan',
            shortLabel: 'Score',
            category: 'radwan',
            source: 'RADWAN',
            sourceField: 'decision_engine',
            format: 'score_badge',
            align: 'center',
            minWidth: 85,
            sortable: true,
            higherIsBetter: true,
            tooltip: 'Índice de 0 a 100 calculado com base em ROAS, CPA, CTR e consistência estatística',
            beginnerDescription: 'Nota geral de 0 a 100 dada pela inteligência Radwan.',
            requiresFields: ['spend', 'actions', 'action_values'],
            calculate: (ins) => {
                if (!window.decisionEngine) return 70;
                const evalRes = window.decisionEngine.evaluateCreative(ins, 35.00);
                return evalRes.score || 70;
            }
        },

        'cpa_deviation': {
            id: 'cpa_deviation',
            label: 'Desvio do CPA Alvo',
            shortLabel: 'Desvio CPA',
            category: 'radwan',
            source: 'RADWAN',
            sourceField: 'spend,actions',
            format: 'deviation_badge',
            align: 'right',
            minWidth: 105,
            sortable: true,
            higherIsBetter: false,
            tooltip: 'Distância percentual do CPA real em relação à meta de R$ 35,00',
            beginnerDescription: 'O quanto o custo por venda está acima ou abaixo da sua meta.',
            requiresFields: ['spend', 'actions'],
            calculate: (ins) => {
                if (!ins || !ins.purchases || ins.purchases <= 0) return null;
                const cpa = ins.spend / ins.purchases;
                const target = 35.00;
                return ((cpa - target) / target) * 100;
            }
        },

        // --- AÇÕES ---
        'actions': {
            id: 'actions',
            label: 'Ações',
            shortLabel: 'Ações',
            category: 'principais',
            source: 'RADWAN',
            sourceField: null,
            format: 'row_actions',
            align: 'center',
            minWidth: 130,
            sortable: false,
            higherIsBetter: null,
            tooltip: 'Ações operacionais rápidas: Diagnóstico com IA, Duplicação com 1 clique e Detalhes',
            beginnerDescription: 'Botões de atalho para operar a campanha.',
            requiresFields: [],
            calculate: (ins, camp) => ({ id: camp?.id || '', name: camp?.name || '' })
        }
    };

    // ─── 3. PRESETS NATIVOS PROFISSIONAIS ──────────────────────────────────────

    const METRIC_PRESETS = {
        'PADRAO_GESTOR': {
            id: 'PADRAO_GESTOR',
            name: 'Padrão do Gestor',
            icon: '⭐',
            isDefault: true,
            description: 'Configuração curada e profissional com as métricas essenciais para decisão diária.',
            columns: [
                'status_toggle',
                'name',
                'radwan_status',
                'daily_budget',
                'spend',
                'purchases',
                'cpa',
                'revenue',
                'roas',
                'profit',
                'link_ctr',
                'link_cpc',
                'cpm',
                'frequency',
                'initiate_checkout',
                'conversion_rate',
                'actions'
            ]
        },
        'ESSENCIAL': {
            id: 'ESSENCIAL',
            name: 'Essencial',
            icon: '⚡',
            description: 'Visão direta e enxuta focada em gasto, vendas, CPA e ROAS.',
            columns: [
                'status_toggle',
                'name',
                'daily_budget',
                'spend',
                'purchases',
                'cpa',
                'roas',
                'actions'
            ]
        },
        'TRAFEGO': {
            id: 'TRAFEGO',
            name: 'Tráfego & Cliques',
            icon: '🔗',
            description: 'Foco na qualidade e custo de aquisição de visitantes.',
            columns: [
                'status_toggle',
                'name',
                'spend',
                'impressions',
                'reach',
                'cpm',
                'link_clicks',
                'link_ctr',
                'link_cpc',
                'landing_page_views',
                'cost_per_lpv',
                'actions'
            ]
        },
        'CONVERSAO': {
            id: 'CONVERSAO',
            name: 'Conversão & Vendas',
            icon: '🛒',
            description: 'Acompanhamento detalhado de compras, checkouts e taxas de conversão.',
            columns: [
                'status_toggle',
                'name',
                'spend',
                'purchases',
                'cpa',
                'revenue',
                'roas',
                'initiate_checkout',
                'cost_per_initiate_checkout',
                'add_to_cart',
                'conversion_rate',
                'actions'
            ]
        },
        'FINANCEIRO': {
            id: 'FINANCEIRO',
            name: 'Financeiro & Retorno',
            icon: '💰',
            description: 'Análise de lucro líquido, margens reais, faturamento e ponto de equilíbrio.',
            columns: [
                'status_toggle',
                'name',
                'spend',
                'revenue',
                'profit',
                'margin',
                'cpa',
                'cpa_deviation',
                'roas',
                'actions'
            ]
        },
        'FUNIL': {
            id: 'FUNIL',
            name: 'Funil Completo',
            icon: '📊',
            description: 'Acompanhamento das taxas de passagem de cada etapa do funil.',
            columns: [
                'status_toggle',
                'name',
                'impressions',
                'link_clicks',
                'landing_page_views',
                'add_to_cart',
                'initiate_checkout',
                'purchases',
                'conversion_rate',
                'funnel_checkout_to_purchase',
                'actions'
            ]
        },
        'VIDEO': {
            id: 'VIDEO',
            name: 'Vídeo & Retenção',
            icon: '🎬',
            description: 'Análise do poder do gancho inicial, ThruPlays e retenção de criativos em vídeo.',
            columns: [
                'status_toggle',
                'name',
                'spend',
                'impressions',
                'video_views_3s',
                'hook_rate',
                'thruplay',
                'cost_per_thruplay',
                'video_p100',
                'actions'
            ]
        },
        'CRIATIVOS': {
            id: 'CRIATIVOS',
            name: 'Criativos & Anúncios',
            icon: '🎨',
            description: 'Avaliação de performance, fadiga e atratividade visual.',
            columns: [
                'status_toggle',
                'name',
                'radwan_status',
                'spend',
                'purchases',
                'cpa',
                'roas',
                'link_ctr',
                'hook_rate',
                'cpm',
                'frequency',
                'actions'
            ]
        },
        'RADWAN': {
            id: 'RADWAN',
            name: 'Inteligência Radwan',
            icon: '⌘',
            description: 'Diagnósticos automatizados, Power Score e oportunidades de escala.',
            columns: [
                'status_toggle',
                'name',
                'radwan_status',
                'radwan_score',
                'cpa_deviation',
                'spend',
                'purchases',
                'roas',
                'profit',
                'actions'
            ]
        },
        'COMPLETO': {
            id: 'COMPLETO',
            name: 'Visão Completa',
            icon: '🌐',
            description: 'Exibe todas as métricas disponíveis na plataforma.',
            columns: Object.keys(METRIC_REGISTRY)
        }
    };

    // ─── 4. FORMATADORES DETERMINÍSTICOS E SEGUROS (ZERO NaN / ZERO NULL) ─────

    class MetricFormatter {
        static format(formatType, value, metric = null) {
            if (value === null || value === undefined || (typeof value === 'number' && (isNaN(value) || !isFinite(value)))) {
                return '<span class="text-[#6E6E73] font-normal">–</span>';
            }

            switch (formatType) {
                case 'currency':
                    return `R$ ${this.numberFormat(value, 2)}`;

                case 'currency_colored': {
                    const num = Number(value);
                    const formatted = `R$ ${this.numberFormat(num, 2)}`;
                    if (num > 0) return `<span class="text-[#1FC16B] font-bold">${formatted}</span>`;
                    if (num < 0) return `<span class="text-[#FF453A] font-bold">${formatted}</span>`;
                    return `<span class="text-[#F5F5F7] font-semibold">${formatted}</span>`;
                }

                case 'currency_editable': {
                    const num = Number(value);
                    return `
                        <button onclick="window.dashboard.openBudgetModalFromRow(this)" class="hover:underline text-[#F5F5F7] font-semibold inline-flex items-center gap-1" title="Clique para editar orçamento">
                            <span>R$ ${this.numberFormat(num, 2)}</span>
                            <span class="text-[10px] text-[#6E6E73]">✏️</span>
                        </button>
                    `;
                }

                case 'percentage': {
                    const num = Number(value);
                    const formatted = `${this.numberFormat(num, 2)}%`;
                    if (metric?.higherIsBetter === true && num >= 2.0) {
                        return `<span class="text-[#1FC16B] font-semibold">${formatted}</span>`;
                    }
                    return `<span class="text-[#F5F5F7]">${formatted}</span>`;
                }

                case 'ratio': {
                    const num = Number(value);
                    const formatted = `${this.numberFormat(num, 2)}x`;
                    if (num >= 2.2) return `<span class="text-[#1FC16B] font-bold">${formatted}</span>`;
                    if (num < 1.5 && num > 0) return `<span class="text-[#FF453A] font-semibold">${formatted}</span>`;
                    return `<span class="text-[#F5F5F7] font-semibold">${formatted}</span>`;
                }

                case 'integer':
                    return Number(value).toLocaleString('pt-BR');

                case 'decimal_2':
                    return this.numberFormat(Number(value), 2);

                case 'radwan_badge': {
                    const st = value || { classification: 'NORMAL', label: 'Saudável' };
                    let badgeClass = 'badge-active';
                    if (st.classification === 'WINNER') badgeClass = 'badge-winner';
                    else if (st.classification === 'FATIGUE') badgeClass = 'badge-error';
                    else if (st.classification === 'WATCH') badgeClass = 'badge-warning';
                    return `<span class="badge ${badgeClass} text-[9.5px]">${st.label}</span>`;
                }

                case 'score_badge': {
                    const score = Math.round(Number(value) || 70);
                    let color = 'text-[#5DA9FF]';
                    if (score >= 85) color = 'text-[#1FC16B]';
                    else if (score < 60) color = 'text-[#FF453A]';
                    return `<span class="font-mono font-bold ${color}">${score}</span>`;
                }

                case 'deviation_badge': {
                    const dev = Number(value);
                    const sign = dev > 0 ? '+' : '';
                    const formatted = `${sign}${this.numberFormat(dev, 1)}%`;
                    if (dev <= 0) return `<span class="text-[#1FC16B] font-semibold">${formatted}</span>`;
                    return `<span class="text-[#FF453A] font-semibold">${formatted}</span>`;
                }

                default:
                    return String(value);
            }
        }

        static numberFormat(num, decimals = 2) {
            if (num === null || num === undefined || isNaN(num)) return '0,00';
            return num.toLocaleString('pt-BR', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        }
    }

    // ─── 5. REPOSITÓRIO DE SAVED VIEWS & PERSISTÊNCIA ─────────────────────────

    class UserViewRepository {
        constructor() {
            this.storageKey = 'radwan_user_views_v1';
            this.activeViewKey = 'radwan_active_view_v1';
        }

        getActivePresetId() {
            try {
                return localStorage.getItem(this.activeViewKey) || 'PADRAO_GESTOR';
            } catch (e) {
                return 'PADRAO_GESTOR';
            }
        }

        setActivePresetId(presetId) {
            try {
                localStorage.setItem(this.activeViewKey, presetId);
            } catch (e) {}
        }

        getCustomColumns(entityType = 'campaign') {
            try {
                const raw = localStorage.getItem(`${this.storageKey}_${entityType}`);
                if (raw) return JSON.parse(raw);
            } catch (e) {}
            return METRIC_PRESETS.PADRAO_GESTOR.columns;
        }

        saveCustomColumns(entityType = 'campaign', columns = []) {
            try {
                localStorage.setItem(`${this.storageKey}_${entityType}`, JSON.stringify(columns));
            } catch (e) {}
        }

        getSavedViews() {
            try {
                const raw = localStorage.getItem('radwan_saved_custom_views');
                if (raw) return JSON.parse(raw);
            } catch (e) {}
            return [];
        }

        saveView(name, columns, entityType = 'campaign') {
            const views = this.getSavedViews();
            const newView = {
                id: `view_${Date.now()}`,
                name: name.trim(),
                entityType,
                columns,
                createdAt: new Date().toISOString()
            };
            views.push(newView);
            try {
                localStorage.setItem('radwan_saved_custom_views', JSON.stringify(views));
            } catch (e) {}
            return newView;
        }

        deleteView(viewId) {
            let views = this.getSavedViews();
            views = views.filter(v => v.id !== viewId);
            try {
                localStorage.setItem('radwan_saved_custom_views', JSON.stringify(views));
            } catch (e) {}
        }
    }

    // ─── 6. CLASSE CENTRAL DO METRIC REGISTRY ─────────────────────────────────

    class MetricsEngine {
        constructor() {
            this.categories = METRIC_CATEGORIES;
            this.metrics = METRIC_REGISTRY;
            this.presets = METRIC_PRESETS;
            this.formatter = MetricFormatter;
            this.repository = new UserViewRepository();
        }

        getMetric(metricId) {
            return this.metrics[metricId] || null;
        }

        getAllMetrics() {
            return Object.values(this.metrics);
        }

        getMetricsByCategory(categoryId) {
            return Object.values(this.metrics).filter(m => m.category === categoryId);
        }

        getPreset(presetId) {
            return this.presets[presetId] || this.presets.PADRAO_GESTOR;
        }

        getActiveColumns(entityType = 'campaign') {
            const activePresetId = this.repository.getActivePresetId();
            if (activePresetId === 'CUSTOM') {
                return this.repository.getCustomColumns(entityType);
            }
            const preset = this.getPreset(activePresetId);
            return preset ? preset.columns : this.presets.PADRAO_GESTOR.columns;
        }

        setActiveColumns(columns, entityType = 'campaign') {
            this.repository.setActivePresetId('CUSTOM');
            this.repository.saveCustomColumns(entityType, columns);
        }

        restoreDefaultPreset(entityType = 'campaign') {
            this.repository.setActivePresetId('PADRAO_GESTOR');
            this.repository.saveCustomColumns(entityType, this.presets.PADRAO_GESTOR.columns);
            return this.presets.PADRAO_GESTOR.columns;
        }

        formatValue(metricId, value) {
            const metric = this.getMetric(metricId);
            if (!metric) return String(value || '–');
            return this.formatter.format(metric.format, value, metric);
        }

        // Query Planner: Descobre os campos necessários da Meta API com base nas colunas ativas
        getRequiredFieldsForColumns(columnIds) {
            const fieldsSet = new Set(['id', 'name', 'status']);
            columnIds.forEach(id => {
                const metric = this.getMetric(id);
                if (metric && metric.requiresFields) {
                    metric.requiresFields.forEach(f => fieldsSet.add(f));
                }
            });
            return Array.from(fieldsSet);
        }
    }

    // Exportação Singleton Global
    window.metricsRegistry = new MetricsEngine();

})(window);
