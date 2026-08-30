// ==============================================================================
// CENTRALIZED META MARKETING CONSTANTS & GOVERNANCE RULES
// ==============================================================================

const META_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const BASE_URL = `https://graph.facebook.com/${META_VERSION}`;

module.exports = {
    META_GRAPH_VERSION: META_VERSION,
    META_GRAPH_BASE_URL: BASE_URL,
    GRAPH_VERSION: META_VERSION,
    GRAPH_BASE_URL: BASE_URL,
    ALLOWED_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID || 'act_846780837970771',
    ALLOWED_BM_ID: '396465144606279',

    // Limites Financeiros & Guardrails
    DEFAULT_MAX_BUDGET_CHANGE_PCT: 15,    // 15% por ciclo
    HARD_CEILING_BUDGET_CHANGE_PCT: 20,   // 20% teto absoluto sem override
    DEFAULT_COOLDOWN_HOURS: 12,           // 12 horas entre mutações do mesmo objeto
    DEFAULT_MAX_DAILY_ACCOUNT_SPEND: 500, // R$ 500,00 diários
    MINIMUM_PURCHASES_FOR_SCALE: 3,       // Amostra mínima de conversões
    MINIMUM_SPEND_FOR_STOPLOSS: 1.15,     // 1.15x CPA Alvo para pausa sem vendas
    MAX_AUTOPILOT_ACTIONS_PER_CYCLE: 5,   // Máximo de ações por ciclo autônomo

    // Categorias Especiais Reguladas (Políticas, Eleitorais, Questões Sociais)
    // EXIGEM APROVAÇÃO HUMANA OBRIGATÓRIA (FAIL CLOSED)
    SPECIAL_AD_CATEGORIES: [
        'POLITICAL_AND_ISSUE_ADS',
        'ELECTIONS_POLITICS',
        'HOUSING',
        'EMPLOYMENT',
        'CREDIT',
        'SOCIAL_ISSUES'
    ],

    // Mapeamento Estrito de Recursos e Operações Permitidas
    ALLOWED_OPERATIONS: {
        'ACCOUNT_INFO': { method: 'GET', pathRegex: /^act_846780837970771$/ },
        'CAMPAIGNS_LIST': { method: 'GET', pathRegex: /^act_846780837970771\/campaigns$/ },
        'CAMPAIGN_CREATE': { method: 'POST', pathRegex: /^act_846780837970771\/campaigns$/ },
        'ADSETS_LIST': { method: 'GET', pathRegex: /^([0-9]+|act_846780837970771)\/adsets$/ },
        'ADS_LIST': { method: 'GET', pathRegex: /^([0-9]+|act_846780837970771)\/ads$/ },
        'INSIGHTS_READ': { method: 'GET', pathRegex: /^([0-9]+|act_846780837970771)\/insights$/ },
        'STATUS_UPDATE': { method: 'POST', pathRegex: /^[0-9]+$/ },
        'BUDGET_UPDATE': { method: 'POST', pathRegex: /^[0-9]+$/ },
        'RENAME_UPDATE': { method: 'POST', pathRegex: /^[0-9]+$/ },
        'CAMPAIGN_COPY': { method: 'POST', pathRegex: /^[0-9]+\/copies$/ },
        'OBJECT_READ': { method: 'GET', pathRegex: /^[0-9]+$/ }
    },

    // Códigos de erro da Meta para Rate Limiting
    RATE_LIMIT_ERROR_CODES: [4, 17, 613, 429]
};
