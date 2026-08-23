// ==============================================================================
// CENTRALIZED META MARKETING CONSTANTS & ALLOWLIST CONFIGURATION
// ==============================================================================

module.exports = {
    GRAPH_VERSION: 'v20.0',
    GRAPH_BASE_URL: 'https://graph.facebook.com/v20.0',
    ALLOWED_AD_ACCOUNT_ID: 'act_846780837970771',
    ALLOWED_BM_ID: '396465144606279',
    
    // Lista estrita de operações autorizadas no backend
    ALLOWED_OPERATIONS: {
        'ACCOUNT_INFO': { method: 'GET', pathRegex: /^act_846780837970771$/ },
        'CAMPAIGNS_LIST': { method: 'GET', pathRegex: /^act_846780837970771\/campaigns$/ },
        'CAMPAIGN_CREATE': { method: 'POST', pathRegex: /^act_846780837970771\/campaigns$/ },
        'ADSETS_LIST': { method: 'GET', pathRegex: /^[0-9]+\/adsets$/ },
        'ADS_LIST': { method: 'GET', pathRegex: /^[0-9]+\/ads$/ },
        'INSIGHTS_READ': { method: 'GET', pathRegex: /^([0-9]+|act_846780837970771)\/insights$/ },
        'STATUS_UPDATE': { method: 'POST', pathRegex: /^[0-9]+$/ },
        'BUDGET_UPDATE': { method: 'POST', pathRegex: /^[0-9]+$/ },
        'OBJECT_READ': { method: 'GET', pathRegex: /^[0-9]+$/ }
    },

    // Códigos de erro da Meta para Rate Limiting
    RATE_LIMIT_ERROR_CODES: [4, 17, 613, 429]
};
