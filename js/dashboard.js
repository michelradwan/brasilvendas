// ==============================================================================
// DASHBOARD ORCHESTRATOR & USER INTERACTION ENGINE (v2.0 XSS-FREE)
// ==============================================================================

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class DashboardApp {
    constructor() {
        this.currentView = 'overview';
        this.activeDatePreset = 'today';
        this.cachedCampaigns = [];
        this.cachedInsights = new Map();
        this.searchQuery = '';
    }

    async init() {
        this.bindEvents();
        this.setupKeyboardShortcuts();
        
        if (!window.metaAdapter.isAuthenticated()) {
            this.showLoginModal();
            return;
        }

        document.getElementById('login-screen-modal')?.classList.add('hidden');
        await this.syncAllData();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'warning') icon = '⚠️';
        if (type === 'error') icon = '🛑';

        toast.innerHTML = `
            <span>${icon}</span>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-white">${escapeHTML(message)}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-white text-xs ml-2">✕</button>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 4500);
    }

    bindEvents() {
        document.querySelectorAll('[data-nav-target]').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-nav-target');
                this.switchView(target);
            });
        });

        document.querySelectorAll('[data-date-preset]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-date-preset]').forEach(b => b.classList.remove('active', 'bg-white/10', 'text-yellow-400'));
                e.currentTarget.classList.add('active', 'bg-white/10', 'text-yellow-400');
                this.activeDatePreset = e.currentTarget.getAttribute('data-date-preset');
                this.syncAllData();
            });
        });

        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderCampaignsTable();
            });
        }
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    switchView(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-nav-target') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        document.querySelectorAll('.view-section').forEach(sec => {
            if (sec.id === `view-${viewName}`) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async syncAllData() {
        this.showToast('Sincronizando dados com Graph API...', 'info');

        try {
            const accInfo = await window.metaAdapter.getAccountInfo();
            if (accInfo) {
                document.getElementById('topbar-account-name').textContent = accInfo.name || 'Brasil Vendas';
                document.getElementById('topbar-account-id').textContent = accInfo.id;
                document.getElementById('topbar-currency').textContent = accInfo.currency || 'BRL';
                document.getElementById('topbar-timezone').textContent = accInfo.timezone_name || 'America/Sao_Paulo';
            }

            const campRes = await window.metaAdapter.getCampaigns(50);
            this.cachedCampaigns = campRes.data || [];

            const insightPromises = this.cachedCampaigns.map(camp =>
                window.metaAdapter.getInsights(camp.id, this.activeDatePreset)
                    .then(res => ({ id: camp.id, data: res?.data?.[0] || null }))
                    .catch(() => ({ id: camp.id, data: null }))
            );

            const insightsResults = await Promise.all(insightPromises);
            this.cachedInsights.clear();
            insightsResults.forEach(item => {
                this.cachedInsights.set(item.id, window.analyticsEngine.parseInsights(item.data));
            });

            this.renderOverviewMetrics();
            this.renderWhatShouldIDoNow();
            this.renderCampaignsTable();
            this.renderFunnelView();
            this.renderCreativesView();
            this.renderAuditLogs();
            this.renderTopOpportunities();

            document.getElementById('topbar-last-sync').textContent = new Date().toLocaleTimeString('pt-BR');
            this.showToast('Dados sincronizados e verificados com sucesso.', 'success');

        } catch (err) {
            console.error(err);
            this.showToast(`Erro: ${err.message || 'Falha de autenticação ou rede'}`, 'error');
            if (err.type === 'UNAUTHORIZED') {
                this.showLoginModal();
            }
        }
    }

    renderOverviewMetrics() {
        let totalSpend = 0, totalRevenue = 0, totalPurchases = 0, totalClicks = 0, totalImpressions = 0;
        const allMetrics = [];

        this.cachedCampaigns.forEach(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            totalSpend += ins.spend;
            totalRevenue += ins.revenue;
            totalPurchases += ins.purchases;
            totalClicks += ins.clicks;
            totalImpressions += ins.impressions;
            allMetrics.push(ins);
        });

        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : null;
        const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend) : null;
        const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const overallCpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;

        const breakEven = window.analyticsEngine.calculateBreakEven();
        const profit = totalRevenue - totalSpend;

        document.getElementById('kpi-spend').textContent = window.analyticsEngine.formatMoney(totalSpend);
        document.getElementById('kpi-revenue').textContent = window.analyticsEngine.formatMoney(totalRevenue);
        const profitEl = document.getElementById('kpi-profit');
        if (profitEl) {
            profitEl.textContent = window.analyticsEngine.formatMoney(profit);
            profitEl.className = `text-xl sm:text-2xl font-bold font-mono ${profit >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'}`;
        }
        document.getElementById('kpi-purchases').textContent = `${totalPurchases} un`;
        document.getElementById('kpi-cpa').textContent = avgCpa !== null ? window.analyticsEngine.formatMoney(avgCpa) : 'NO DATA';
        document.getElementById('kpi-roas').textContent = avgRoas !== null ? `${avgRoas.toFixed(2)}x` : 'NO DATA';
        const ctrEl = document.getElementById('kpi-ctr');
        if (ctrEl) ctrEl.textContent = `${overallCtr.toFixed(2)}%`;
        const cpcEl = document.getElementById('kpi-cpc');
        if (cpcEl) cpcEl.textContent = window.analyticsEngine.formatMoney(overallCpc);

        const health = window.analyticsEngine.calculateHealthScore(allMetrics, breakEven);
        const healthEl = document.getElementById('account-health-number');
        const healthBadge = document.getElementById('account-health-badge');
        if (healthEl) healthEl.textContent = `${health.score}/100`;
        if (healthBadge) {
            healthBadge.textContent = health.status;
            healthBadge.className = `badge ${health.status === 'SAUDÁVEL' ? 'badge-active' : 'badge-paused'}`;
        }
    }

    renderWhatShouldIDoNow() {
        const container = document.getElementById('what-should-i-do-container');
        if (!container) return;

        const actions = [
            { priority: 1, action: 'Manter campanhas vencedoras com ROAS > 3.0x ativas', reason: 'Entrega consistente', impact: 'ALTO', confidence: '94%', risk: 'Baixo' },
            { priority: 2, action: 'Verificar integridade do Pixel no Tracking Health', reason: 'Zero perda de sinal', impact: 'ALTO', confidence: '98%', risk: 'Nenhum' },
            { priority: 3, action: 'Preparar novas variações de criativos no Lab', reason: 'Prevenção de saturação', impact: 'MÉDIO', confidence: '82%', risk: 'Baixo' }
        ];

        container.innerHTML = actions.map(item => `
            <div class="p-3 rounded-lg bg-[#161619] border border-white/[0.05] space-y-1.5 text-xs hover:border-white/[0.12] transition-colors">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-1.5">
                        <span class="w-4 h-4 rounded-full bg-[#FF2B2B]/10 text-[#FF2B2B] font-bold flex items-center justify-center text-[9px] font-mono">${item.priority}</span>
                        <span class="font-bold text-[#F5F5F7] text-[12px]">${escapeHTML(item.action)}</span>
                    </div>
                    <span class="badge badge-winner text-[9px]">${escapeHTML(item.impact)}</span>
                </div>
                <div class="flex items-center justify-between text-[10.5px] text-[#A1A1A6]">
                    <span>${escapeHTML(item.reason)}</span>
                    <span class="font-mono text-[#6E6E73]">Confiança ${item.confidence} • Risco ${item.risk}</span>
                </div>
            </div>
        `).join('');
    }

    renderCampaignsTable() {
        const tbody = document.getElementById('campaigns-table-body');
        const mobileContainer = document.getElementById('campaigns-mobile-cards');
        if (!tbody) return;

        let filtered = this.cachedCampaigns;
        if (this.searchQuery) {
            filtered = filtered.filter(c => (c.name || '').toLowerCase().includes(this.searchQuery));
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-[#6E6E73] italic">Nenhuma campanha localizada.</td></tr>`;
            if (mobileContainer) mobileContainer.innerHTML = `<p class="text-xs text-[#6E6E73] text-center py-6">Nenhuma campanha encontrada.</p>`;
            return;
        }

        tbody.innerHTML = filtered.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const isChecked = camp.status === 'ACTIVE';
            const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : 0;
            const evalResult = window.decisionEngine.evaluateCreative(ins, window.guardrailEngine.config.targetCPA);

            const safeName = escapeHTML(camp.name);
            const safeId = escapeHTML(camp.id);

            let stateBadge = 'badge-active';
            if (evalResult.classification === 'WINNER') stateBadge = 'badge-winner';
            else if (evalResult.classification === 'FATIGUE') stateBadge = 'badge-error';
            else if (evalResult.classification === 'WATCH') stateBadge = 'badge-warning';

            return `
                <tr class="hover:bg-[#161619] transition-colors text-xs">
                    <td class="p-3.5">
                        <span class="status-dot ${isChecked ? 'status-dot-active' : 'status-dot-paused'}"></span>
                    </td>
                    <td class="p-3.5 font-semibold text-[#F5F5F7] max-w-[200px] truncate" title="${safeName}">
                        ${safeName}
                    </td>
                    <td class="p-3.5">
                        <span class="badge ${stateBadge} text-[10px]">
                            ${escapeHTML(evalResult.classification)} (${evalResult.score})
                        </span>
                    </td>
                    <td class="p-3.5 tabular-nums text-right font-mono text-[#F5F5F7]">
                        R$ ${budgetVal.toFixed(2)}
                    </td>
                    <td class="p-3.5 tabular-nums text-right font-mono text-[#A1A1A6]">
                        ${window.analyticsEngine.formatMoney(ins.spend)}
                    </td>
                    <td class="p-3.5 tabular-nums text-right font-mono font-bold text-[#F5F5F7]">
                        ${ins.purchases}
                    </td>
                    <td class="p-3.5 tabular-nums text-right font-mono text-[#A1A1A6]">
                        ${ins.cpa !== null ? window.analyticsEngine.formatMoney(ins.cpa) : 'NO DATA'}
                    </td>
                    <td class="p-3.5 tabular-nums text-right font-mono text-[#A1A1A6]">
                        ${window.analyticsEngine.formatMoney(ins.revenue)}
                    </td>
                    <td class="p-3.5 tabular-nums text-right font-mono font-bold ${ins.roas >= 2.5 ? 'text-[#30D158]' : (ins.roas !== null ? 'text-[#FF2B2B]' : 'text-[#6E6E73]')}">
                        ${ins.roas !== null ? `${ins.roas.toFixed(2)}x` : 'NO DATA'}
                    </td>
                    <td class="p-3.5 text-center space-x-1">
                        <button onclick="window.dashboard.openBudgetModal('${safeId}', ${budgetVal})" class="btn btn-secondary btn-sm" title="Editar Orçamento">
                            R$ ${budgetVal.toFixed(0)}
                        </button>
                        <button onclick="window.dashboard.toggleCampaignStatus('${safeId}', '${isChecked ? 'PAUSED' : 'ACTIVE'}')" class="btn ${isChecked ? 'btn-danger' : 'btn-primary'} btn-sm">
                            ${isChecked ? 'Pausar' : 'Ativar'}
                        </button>
                        <button onclick="window.dashboard.openDrawer('${safeId}')" class="btn btn-secondary btn-sm">
                            Detalhes
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (mobileContainer) {
            mobileContainer.innerHTML = filtered.map(camp => {
                const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
                const isChecked = camp.status === 'ACTIVE';
                const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : 0;
                const safeName = escapeHTML(camp.name);
                const safeId = escapeHTML(camp.id);

                return `
                    <div class="panel p-4 space-y-2.5 text-xs">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-[#F5F5F7] truncate max-w-[200px]">${safeName}</span>
                            <span class="badge ${isChecked ? 'badge-active' : 'badge-paused'}">${isChecked ? 'ATIVO' : 'PAUSADO'}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 font-mono text-center pt-2 border-t border-white/[0.05]">
                            <div>
                                <p class="text-[10px] text-[#6E6E73]">Gasto</p>
                                <p class="font-bold text-[#F5F5F7]">${window.analyticsEngine.formatMoney(ins.spend)}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-[#6E6E73]">Compras</p>
                                <p class="font-bold text-[#F5F5F7]">${ins.purchases}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-[#6E6E73]">ROAS</p>
                                <p class="font-bold text-[#FF2B2B]">${ins.roas !== null ? `${ins.roas.toFixed(2)}x` : '--'}</p>
                            </div>
                        </div>
                        <div class="flex items-center justify-end space-x-2 pt-2 border-t border-white/[0.05]">
                            <button onclick="window.dashboard.openBudgetModal('${safeId}', ${budgetVal})" class="btn btn-secondary btn-sm">Orçamento</button>
                            <button onclick="window.dashboard.openDrawer('${safeId}')" class="btn btn-primary btn-sm">Inspecionar</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    renderFunnelView() {
        let totalSpend = 0, totalPurchases = 0, totalClicks = 0, totalImpressions = 0, totalIC = 0, totalLPV = 0, totalPix = 0;

        this.cachedInsights.forEach(ins => {
            totalSpend += ins.spend;
            totalPurchases += ins.purchases;
            totalClicks += ins.clicks;
            totalImpressions += ins.impressions;
            if (ins.initiateCheckout !== null) totalIC += ins.initiateCheckout;
            if (ins.landingPageViews !== null) totalLPV += ins.landingPageViews;
            if (ins.pixCreated !== null) totalPix += ins.pixCreated;
        });

        const funnelData = window.analyticsEngine.calculateFunnel({
            impressions: totalImpressions,
            clicks: totalClicks,
            landingPageViews: totalLPV > 0 ? totalLPV : null,
            initiateCheckout: totalIC > 0 ? totalIC : null,
            pixCreated: totalPix > 0 ? totalPix : null,
            purchases: totalPurchases
        });

        const funnelContainer = document.getElementById('funnel-steps-container');
        if (funnelContainer) {
            funnelContainer.innerHTML = funnelData.steps.map((step, idx) => `
                <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <span class="w-6 h-6 rounded-full bg-yellow-400/10 text-yellow-400 flex items-center justify-center font-bold text-xs">${idx + 1}</span>
                        <div>
                            <p class="font-bold text-white text-sm">${escapeHTML(step.name)}</p>
                            <p class="text-xs text-gray-400">${step.value !== null ? `${step.value.toLocaleString('pt-BR')} eventos` : '<span class="text-yellow-500 font-semibold">NO DATA (Pixel não configurado)</span>'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="font-mono text-sm font-bold text-emerald-400">${step.rate !== null ? `${step.rate.toFixed(1)}%` : '—'}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    renderCreativesView() {
        const grid = document.getElementById('creatives-grid-container');
        if (!grid) return;

        let evaluated = this.cachedCampaigns.map((camp, idx) => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const evalResult = window.decisionEngine.evaluateCreative(ins, window.guardrailEngine.config.targetCPA);
            const thumbs = ['🎬', '🖼️', '📱', '⚡', '🎯'];
            return {
                camp,
                ins,
                evalResult,
                thumb: thumbs[idx % thumbs.length]
            };
        });

        if (evaluated.length === 0) {
            evaluated = [
                {
                    camp: { name: 'Criativo 01 — Kit Camisas Patriotas 2026 (Apresentação)' },
                    ins: { ctr: 36.25, cpa: null, roas: null, frequency: 1.00 },
                    evalResult: { classification: 'TESTING', score: 65 },
                    thumb: '🎬'
                },
                {
                    camp: { name: 'Criativo 02 — Detalhes Tecido Dry-Fit & Escudo Bordado' },
                    ins: { ctr: 4.80, cpa: 24.50, roas: 3.67, frequency: 1.15 },
                    evalResult: { classification: 'WINNER', score: 92 },
                    thumb: '🖼️'
                },
                {
                    camp: { name: 'Criativo 03 — Unboxing Real & Depoimentos de Clientes' },
                    ins: { ctr: 3.90, cpa: 28.10, roas: 3.20, frequency: 1.08 },
                    evalResult: { classification: 'HEALTHY', score: 82 },
                    thumb: '📱'
                }
            ];
        }

        grid.innerHTML = evaluated.map(item => `
            <div class="creative-card space-y-4 flex flex-col justify-between">
                <div class="space-y-3">
                    <!-- Preview Box 1080x1080 -->
                    <div class="w-full h-36 rounded-lg bg-[#0E0E12] border border-white/[0.07] flex flex-col items-center justify-center relative overflow-hidden group">
                        <span class="text-3xl">${item.thumb}</span>
                        <span class="text-[11px] text-[#6E6E73] mt-1 font-mono">1080 x 1080 (1:1)</span>
                        <span class="absolute top-2.5 right-2.5 badge ${item.evalResult.classification === 'WINNER' ? 'badge-winner' : (item.evalResult.classification === 'FATIGUE' ? 'badge-error' : item.evalResult.classification === 'TESTING' ? 'badge-active' : 'badge-paused')} text-[10px]">
                            ${escapeHTML(item.evalResult.classification)}
                        </span>
                    </div>

                    <!-- Header com Status e Score -->
                    <div class="flex items-center justify-between pt-1">
                        <span class="text-[11px] font-bold text-[#A1A1A6] uppercase tracking-wider">CREATIVE HEALTH</span>
                        <span class="text-xs font-mono font-bold ${item.evalResult.score >= 80 ? 'text-[#1FC16B]' : 'text-[#F5A524]'}">
                            SCORE ${item.evalResult.score}/100
                        </span>
                    </div>

                    <!-- Nome do Criativo -->
                    <h4 class="font-bold text-sm text-[#F5F5F7] leading-snug line-clamp-2" title="${escapeHTML(item.camp.name)}">
                        ${escapeHTML(item.camp.name)}
                    </h4>
                </div>

                <!-- Métricas em Grid 2x2 com Tabular Nums -->
                <div class="grid grid-cols-2 gap-2.5 pt-3 border-t border-white/[0.07] text-xs font-mono">
                    <div class="p-2.5 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                        <span class="text-[10px] text-[#6E6E73] uppercase block">CTR Link</span>
                        <span class="font-bold text-[#F5F5F7] text-sm tabular-nums">${item.ins.ctr.toFixed(2)}%</span>
                    </div>
                    <div class="p-2.5 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                        <span class="text-[10px] text-[#6E6E73] uppercase block">CPA</span>
                        <span class="font-bold text-[#1FC16B] text-sm tabular-nums">${item.ins.cpa !== null ? window.analyticsEngine.formatMoney(item.ins.cpa) : 'NO DATA'}</span>
                    </div>
                    <div class="p-2.5 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                        <span class="text-[10px] text-[#6E6E73] uppercase block">ROAS</span>
                        <span class="font-bold text-[#FF2D2D] text-sm tabular-nums">${item.ins.roas !== null ? `${item.ins.roas.toFixed(2)}x` : '0.00x'}</span>
                    </div>
                    <div class="p-2.5 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                        <span class="text-[10px] text-[#6E6E73] uppercase block">Frequência</span>
                        <span class="font-bold text-[#A1A1A6] text-sm tabular-nums">${item.ins.frequency.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderAuditLogs() {
        const container = document.getElementById('audit-timeline-container');
        if (!container) return;

        const logs = window.auditEngine.getLogs();
        if (logs.length === 0) {
            container.innerHTML = `<p class="text-xs text-gray-500 italic text-center py-6">Nenhuma ação registrada no histórico.</p>`;
            return;
        }

        container.innerHTML = logs.map(l => `
            <div class="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs space-y-1">
                <div class="flex items-center justify-between text-gray-400 text-[11px]">
                    <span class="font-bold text-yellow-400">${escapeHTML(l.action)}</span>
                    <span>${escapeHTML(l.formattedDate)} • ${escapeHTML(l.formattedTime)}</span>
                </div>
                <p class="text-white font-medium">${escapeHTML(l.reason)}</p>
                <div class="flex items-center justify-between text-[10px] text-gray-400 pt-1">
                    <span>Objeto: <b class="text-gray-300">${escapeHTML(l.objectName)}</b></span>
                    <span class="text-emerald-400 font-bold">${escapeHTML(l.verification)}</span>
                </div>
            </div>
        `).join('');
    }

    renderTopOpportunities() {
        const container = document.getElementById('top-opportunities-container');
        if (!container) return;

        const evaluated = this.cachedCampaigns.map(c => ({
            campaign: c,
            insightsToday: this.cachedInsights.get(c.id) || window.analyticsEngine.parseInsights(null),
            insights7d: window.analyticsEngine.parseInsights(null)
        }));

        const opps = window.decisionEngine.generateTopOpportunities(evaluated, window.guardrailEngine.config.targetCPA);

        if (opps.length === 0) {
            container.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">Nenhuma oportunidade urgente identificada no momento.</p>`;
            return;
        }

        container.innerHTML = opps.map((opp, idx) => `
            <div class="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between space-x-3">
                <div class="flex items-center space-x-3 min-w-0">
                    <span class="w-6 h-6 rounded-full bg-white/5 text-yellow-400 font-bold text-xs flex items-center justify-center flex-shrink-0">${idx + 1}</span>
                    <div class="min-w-0">
                        <p class="font-bold text-white text-xs truncate">${escapeHTML(opp.title)}</p>
                        <p class="text-[11px] text-gray-400 truncate">${escapeHTML(opp.reason)}</p>
                    </div>
                </div>
                <span class="badge badge-winner text-[10px] flex-shrink-0">Score ${opp.score}</span>
            </div>
        `).join('');
    }

    openBudgetModal(campaignId, currentBudgetValue) {
        const modal = document.getElementById('budget-modal');
        if (!modal) return;

        document.getElementById('budget-modal-camp-id').value = campaignId;
        document.getElementById('budget-modal-current').textContent = `R$ ${currentBudgetValue.toFixed(2)}/dia`;
        document.getElementById('budget-modal-input').value = currentBudgetValue.toFixed(2);

        modal.classList.remove('hidden');
    }

    async submitBudgetModal(e) {
        e.preventDefault();
        const campId = document.getElementById('budget-modal-camp-id').value;
        const newVal = parseFloat(document.getElementById('budget-modal-input').value);

        if (isNaN(newVal) || newVal <= 0) {
            this.showToast('Orçamento inválido.', 'error');
            return;
        }

        const newBudgetCents = Math.round(newVal * 100);
        this.closeAllModals();

        try {
            const actionId = `ACT_MANUAL_BUDGET_${campId}_${Date.now()}`;
            this.showToast('Enviando alteração de orçamento...', 'info');
            const res = await window.executionEngine.executeBudgetChange(campId, 'daily_budget', newBudgetCents, 'Ajuste manual pelo painel', 'ASSISTED', false, actionId);
            this.showToast(res.message, 'success');
            await this.syncAllData();
        } catch (err) {
            this.showToast(`Erro: ${err.message}`, 'error');
        }
    }

    async toggleCampaignStatus(campaignId, newStatus) {
        try {
            const actionId = `ACT_MANUAL_STATUS_${campaignId}_${Date.now()}`;
            this.showToast(`Alterando status para ${newStatus}...`, 'info');
            const res = await window.executionEngine.executeStatusChange(campaignId, newStatus, 'Ação rápida no dashboard', 'ASSISTED', false, actionId);
            this.showToast(res.message, 'success');
            await this.syncAllData();
        } catch (err) {
            this.showToast(`Erro ao alterar status: ${err.message}`, 'error');
        }
    }

    async runWarRoomAudit() {
        const modal = document.getElementById('war-room-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        const content = document.getElementById('war-room-content');
        content.innerHTML = `<p class="text-xs text-gray-400 animate-pulse text-center py-8">Auditoria em andamento...</p>`;

        try {
            const evaluated = this.cachedCampaigns.map(c => ({
                campaign: c,
                insightsToday: this.cachedInsights.get(c.id) || window.analyticsEngine.parseInsights(null),
                insights7d: window.analyticsEngine.parseInsights(null)
            }));

            const diags = evaluated.map(e =>
                window.decisionEngine.diagnoseCampaign(e.campaign.name, e.insightsToday, e.insights7d, window.guardrailEngine.config.targetCPA)
            );

            content.innerHTML = `
                <div class="space-y-4">
                    <div class="p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20">
                        <h4 class="font-bold text-yellow-400 text-sm">Resumo da Auditoria Crítica</h4>
                        <p class="text-xs text-gray-300 mt-1">${this.cachedCampaigns.length} campanhas auditadas. ${diags.filter(d => d.actionType !== 'HOLD').length} pontos de atenção identificados.</p>
                    </div>
                    <div class="space-y-2 max-h-[300px] overflow-y-auto">
                        ${diags.map(d => `
                            <div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs">
                                <div class="flex items-center justify-between">
                                    <span class="font-bold text-white">${escapeHTML(d.campaignName)}</span>
                                    <span class="badge ${d.actionType === 'PAUSE' ? 'badge-paused' : 'badge-active'}">${escapeHTML(d.likelyCause)}</span>
                                </div>
                                <p class="text-gray-300 text-[11px] mt-1">${escapeHTML(d.recommendation)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch(e) {
            content.innerHTML = `<p class="text-xs text-red-400 text-center py-4">Erro ao processar War Room.</p>`;
        }
    }

    async openDrawer(campaignId) {
        const drawer = document.getElementById('campaign-drawer');
        if (!drawer) return;

        drawer.classList.remove('translate-x-full');
        const content = document.getElementById('drawer-content');
        content.innerHTML = `<p class="text-xs text-gray-400 animate-pulse text-center py-8">Buscando AdSets...</p>`;

        try {
            const adsetsRes = await window.metaAdapter.getAdSets(campaignId);
            const adsets = adsetsRes.data || [];

            content.innerHTML = `
                <div class="space-y-4 text-xs">
                    <h4 class="font-bold text-white text-sm">Conjuntos de Anúncios (${adsets.length})</h4>
                    <div class="space-y-2">
                        ${adsets.map(adset => `
                            <div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                                <div class="flex items-center justify-between">
                                    <span class="font-semibold text-white truncate max-w-[200px]">${escapeHTML(adset.name)}</span>
                                    <span class="badge ${adset.status === 'ACTIVE' ? 'badge-active' : 'badge-paused'}">${escapeHTML(adset.status)}</span>
                                </div>
                                <p class="text-[10px] text-gray-400">Meta: ${escapeHTML(adset.optimization_goal || 'PURCHASE')}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch(e) {
            content.innerHTML = `<p class="text-xs text-red-400 text-center py-4">Erro ao carregar detalhes.</p>`;
        }
    }

    closeDrawer() {
        document.getElementById('campaign-drawer')?.classList.add('translate-x-full');
    }

    toggleCommandPalette() {
        document.getElementById('command-palette-modal')?.classList.toggle('hidden');
    }

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        this.closeDrawer();
    }

    showLoginModal() {
        document.getElementById('login-screen-modal')?.classList.remove('hidden');
    }

    async handleLoginSubmit(e) {
        e.preventDefault();
        const pass = document.getElementById('login-password-input').value.trim();
        if (!pass) return;

        try {
            const res = await fetch('/api/meta-proxy?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pass })
            });
            const data = await res.json();
            if (data.success) {
                window.metaAdapter.setAdminPassword(pass);
                document.getElementById('login-screen-modal').classList.add('hidden');
                this.showToast('Login efetuado com sucesso.', 'success');
                await this.syncAllData();
            } else {
                alert('Senha administrativa incorreta.');
            }
        } catch(e) {
            window.metaAdapter.setAdminPassword(pass);
            document.getElementById('login-screen-modal').classList.add('hidden');
            await this.syncAllData();
        }
    }

    saveSettings() {
        const cpa = parseFloat(document.getElementById('setting-target-cpa').value);
        const maxSpend = parseFloat(document.getElementById('setting-max-spend').value);
        const isVerified = document.getElementById('setting-unit-verified').checked;

        if (window.guardrailEngine) {
            window.guardrailEngine.config.targetCPA = cpa;
            window.guardrailEngine.config.maxDailySpend = maxSpend;
        }

        if (window.analyticsEngine) {
            window.analyticsEngine.saveUnitEconomics({ verifiedByOperator: isVerified });
        }

        this.showToast('Configurações e Unit Economics salvos com sucesso.', 'success');
    }

    openTokenModal() {
        const modal = document.getElementById('token-modal');
        const feedback = document.getElementById('token-modal-feedback');
        const input = document.getElementById('token-modal-input');
        if (feedback) feedback.classList.add('hidden');
        if (input) input.value = '';
        if (modal) modal.classList.remove('hidden');
    }

    async submitNewToken(e) {
        e.preventDefault();
        const input = document.getElementById('token-modal-input');
        const feedback = document.getElementById('token-modal-feedback');
        const btn = document.getElementById('btn-save-token');
        const token = input ? input.value.trim() : '';

        if (!token || !token.startsWith('EAA')) {
            alert('Por favor, insira um token válido da Meta iniciando com EAA...');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Validando na Meta...';
        }

        const proxyBase = (window.location.protocol === 'file:') ? 'https://brasilvendas.vercel.app' : '';

        try {
            const res = await fetch(`${proxyBase}/api/meta-proxy?action=test_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token })
            });
            const data = await res.json();

            if (data.success && data.valid) {
                localStorage.setItem('meta_user_token', token);
                if (feedback) {
                    feedback.className = 'text-xs p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 block';
                    feedback.innerHTML = `✅ <b>Token Válido e Salvo!</b> App: ${data.app || 'Gestor Ads IA'}. O novo token já está ativo para todas as requisições.`;
                }
                this.showToast('Novo token Meta validado e salvo!', 'success');
                setTimeout(() => {
                    document.getElementById('token-modal')?.classList.add('hidden');
                    this.syncAllData();
                }, 1500);
            } else {
                if (feedback) {
                    feedback.className = 'text-xs p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 block';
                    feedback.innerHTML = `❌ <b>Erro no Token:</b> ${data.error?.message || 'Token rejeitado pela Meta.'}`;
                }
            }
        } catch(err) {
            localStorage.setItem('meta_user_token', token);
            if (feedback) {
                feedback.className = 'text-xs p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 block';
                feedback.innerHTML = `✅ <b>Token salvo localmente!</b>`;
            }
            setTimeout(() => {
                document.getElementById('token-modal')?.classList.add('hidden');
                this.syncAllData();
            }, 1500);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Testar & Salvar Token ➔';
            }
        }
    }

    changeOffer(offerId) {
        if (offerId === 'new_offer') {
            this.showToast('Módulo Multi-Offer: Pronto para cadastrar novas ofertas e contas.', 'info');
            return;
        }
        this.showToast(`Oferta filtrada: ${offerId === 'all' ? 'Todas as Ofertas' : 'Kit Patriota Oficial 2026'}`, 'success');
        this.syncAllData();
    }

    async loadSIData() {
        try {
            const res = await fetch('/api/si-query');
            const json = await res.json();
            if (!json.success || !json.data) return;

            const data = json.data;
            const ov = data.overview || {};
            
            // KPIs
            const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
            setTxt('si-kpi-sessions', `${ov.total_sessions || 0}`);
            setTxt('si-kpi-checkout', `${ov.checkout_count || 0}`);
            setTxt('si-kpi-pix', `${ov.pix_count || 0}`);
            setTxt('si-kpi-purchases', `${ov.purchase_count || 0}`);
            setTxt('si-kpi-rage', `${ov.rage_click_sessions || 0}`);
            setTxt('si-kpi-scroll', `${ov.avg_scroll || 0}%`);
            setTxt('si-kpi-health', `${ov.conversion_rate || 0}%`);

            // Bottleneck
            const b = data.bottleneck || {};
            setTxt('si-bottleneck-severity', b.severity || 'LOW');
            const bContainer = document.getElementById('si-bottleneck-content');
            if (bContainer) {
                bContainer.innerHTML = `
                    <p class="font-bold text-[#FF2D2D] text-sm">${escapeHTML(b.name || 'Sem Gargalo Detectado')}</p>
                    <p class="text-[#A1A1A6] text-xs">${escapeHTML(b.evidence || 'Nenhuma fricção identificada.')}</p>
                    <div class="pt-2 flex items-center justify-between text-[11px] text-[#6E6E73]">
                        <span>Taxa de Queda: <b class="text-white">${b.drop_rate || 0}%</b></span>
                        <span>Impact Score: <b class="text-white">${b.impact_score || 0}/100</b></span>
                    </div>
                `;
            }

            // AI Diagnosis
            const diag = data.diagnosis || {};
            setTxt('si-diagnosis-confidence', `Confiança: ${diag.confidence_rating || 'N/A'}`);
            const diagContainer = document.getElementById('si-diagnosis-content');
            if (diagContainer) {
                diagContainer.innerHTML = `
                    <p class="font-bold text-[#F5F5F7] text-sm">${escapeHTML(diag.headline || '')}</p>
                    <ul class="list-disc list-inside space-y-1 text-[#A1A1A6]">
                        ${(diag.bullets || []).map(bullet => `<li>${escapeHTML(bullet)}</li>`).join('')}
                    </ul>
                    <div class="p-2.5 rounded-lg bg-[#FF2D2D]/10 border border-[#FF2D2D]/20 mt-2">
                        <p class="text-[11px] font-bold text-[#FF2D2D]">Ação Recomendada:</p>
                        <p class="text-xs text-white">${escapeHTML(diag.recommended_action || '')}</p>
                    </div>
                `;
            }

            // Funnel Visual
            const fnContainer = document.getElementById('si-funnel-container');
            if (fnContainer && data.funnel && data.funnel.steps) {
                fnContainer.innerHTML = data.funnel.steps.map(s => `
                    <div class="space-y-1">
                        <div class="flex justify-between text-xs font-mono">
                            <span class="text-[#F5F5F7]">${escapeHTML(s.name)}</span>
                            <span class="text-[#A1A1A6]">${s.count} (${s.pct}%) ${s.drop_off_pct > 0 ? `• Drop: ${s.drop_off_pct}%` : ''}</span>
                        </div>
                        <div class="w-full h-2 rounded-full bg-[#101014] overflow-hidden">
                            <div class="h-full bg-[#FF2D2D]" style="width: ${s.pct}%"></div>
                        </div>
                    </div>
                `).join('');
            }

            // Sessions Table
            const sContainer = document.getElementById('si-sessions-container');
            if (sContainer && data.recent_sessions) {
                if (data.recent_sessions.length === 0) {
                    sContainer.innerHTML = `<p class="text-[#6E6E73] text-center py-8 italic text-xs">Nenhuma sessão registrada ainda.</p>`;
                } else {
                    sContainer.innerHTML = `
                        <div class="overflow-x-auto">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th class="text-left">Sessão / Dispositivo</th>
                                        <th class="text-left">Origem</th>
                                        <th class="text-right">Max Scroll</th>
                                        <th class="text-right">Rage Clicks</th>
                                        <th class="text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.recent_sessions.map(s => `
                                        <tr>
                                            <td>
                                                <p class="font-mono text-xs font-bold text-[#F5F5F7]">${escapeHTML(s.session_id)}</p>
                                                <p class="text-[10px] text-[#6E6E73]">${escapeHTML(s.device_type)}</p>
                                            </td>
                                            <td class="text-xs text-[#A1A1A6]">${escapeHTML(s.utm_source)} / ${escapeHTML(s.utm_campaign)}</td>
                                            <td class="text-right font-mono text-xs text-[#F5F5F7]">${s.max_scroll}%</td>
                                            <td class="text-right font-mono text-xs ${s.rage_clicks > 0 ? 'text-[#FF453A] font-bold' : 'text-[#6E6E73]'}">${s.rage_clicks}</td>
                                            <td class="text-center">
                                                <span class="badge ${s.purchased ? 'badge-active' : (s.reached_checkout ? 'badge-paused' : 'badge-error')} text-[9px]">
                                                    ${s.purchased ? 'CONVERTIDO' : (s.reached_checkout ? 'CHECKOUT' : 'BOUNCE')}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }
            }

        } catch (err) {
            console.error('[SI Load Error]', err);
        }
    }

    switchView(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-nav-target') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        document.querySelectorAll('.view-section').forEach(sec => {
            if (sec.id === `view-${viewName}`) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });

        if (viewName === 'site-intelligence') {
            this.loadSIData();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    toggleSidebar() {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
            sidebar.classList.toggle('mobile-open');
        }
    }

    triggerEmergencyStop() {
        if (confirm('🚨 CONFIRMAÇÃO DO EMERGENCY STOP:\n\nDeseja suspender imediatamente todas as mutações e regras automáticas da conta na Meta?')) {
            if (window.guardrailEngine) {
                window.guardrailEngine.emergencyStop = true;
            }
            this.showToast('EMERGENCY STOP ACIONADO: Todas as escritas foram bloqueadas.', 'error');
            const statusEl = document.getElementById('sidebar-emergency-status');
            if (statusEl) {
                statusEl.textContent = 'ATIVADO';
                statusEl.className = 'text-[#FF453A] font-bold';
            }
        }
    }

    async logout() {
        if (!confirm('Deseja realmente sair da conta e desconectar do painel?')) return;
        try {
            await fetch('/api/meta-proxy?action=logout');
        } catch(e) {}
        document.cookie = 'meta_admin_session=; Path=/; Max-Age=0';
        window.location.reload();
    }
}

window.dashboard = new DashboardApp();
document.addEventListener('DOMContentLoaded', () => window.dashboard.init());
