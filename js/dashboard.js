// ==============================================================================
// DASHBOARD ORCHESTRATOR & USER INTERACTION ENGINE
// ==============================================================================

class DashboardApp {
    constructor() {
        this.currentView = 'overview';
        this.activeDatePreset = 'today';
        this.cachedCampaigns = [];
        this.cachedInsights = new Map();
        this.selectedCampaignForDrawer = null;
        this.searchQuery = '';
        this.statusFilter = 'ALL';
    }

    async init() {
        this.bindEvents();
        this.setupKeyboardShortcuts();
        
        const { token, adAccountId } = window.metaAdapter.getStoredCredentials();
        if (!token) {
            this.showSetupModal();
            return;
        }

        this.updateTopBarContext();
        await this.syncAllData();
        window.autopilotEngine.startScheduler();
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
                <p class="text-xs font-medium text-white">${message}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-white text-xs ml-2">✕</button>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 4500);
    }

    bindEvents() {
        // Navegação da Sidebar
        document.querySelectorAll('[data-nav-target]').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-nav-target');
                this.switchView(target);
            });
        });

        // Date Preset Filters
        document.querySelectorAll('[data-date-preset]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-date-preset]').forEach(b => b.classList.remove('active', 'bg-white/10', 'text-yellow-400'));
                e.currentTarget.classList.add('active', 'bg-white/10', 'text-yellow-400');
                this.activeDatePreset = e.currentTarget.getAttribute('data-date-preset');
                this.syncAllData();
            });
        });

        // Search Input
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
            // Ctrl+K ou Cmd+K: Abre Command Palette
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleCommandPalette();
            }
            // Esc: Fecha modais ou drawers abertos
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    switchView(viewName) {
        this.currentView = viewName;

        // Atualiza Sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-nav-target') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Alterna containers de visualização
        document.querySelectorAll('.view-section').forEach(sec => {
            if (sec.id === `view-${viewName}`) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async updateTopBarContext() {
        const { adAccountId } = window.metaAdapter.getStoredCredentials();
        try {
            const acc = await window.metaAdapter.getAccountInfo(adAccountId);
            if (acc && !acc.error) {
                document.getElementById('topbar-account-name').textContent = acc.name || 'Conta Principal';
                document.getElementById('topbar-account-id').textContent = acc.id;
                document.getElementById('topbar-currency').textContent = acc.currency || 'BRL';
                document.getElementById('topbar-timezone').textContent = acc.timezone_name || 'America/Sao_Paulo';
            }
        } catch(e){}
    }

    async syncAllData() {
        this.showToast('Sincronizando dados ao vivo da Meta Ads...', 'info');
        const { adAccountId } = window.metaAdapter.getStoredCredentials();

        try {
            // 1. Buscar Campanhas
            const campRes = await window.metaAdapter.getCampaigns(adAccountId, 30);
            this.cachedCampaigns = campRes.data || [];

            // 2. Buscar Insights em paralelo
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

            // 3. Renderizar Visão Geral e Campanhas
            this.renderOverviewMetrics();
            this.renderCampaignsTable();
            this.renderFunnelView();
            this.renderCreativesView();
            this.renderAuditLogs();
            this.renderTopOpportunities();

            document.getElementById('topbar-last-sync').textContent = new Date().toLocaleTimeString('pt-BR');
            this.showToast('Dados sincronizados e verificados.', 'success');

        } catch (err) {
            console.error(err);
            this.showToast(`Erro na sincronização: ${err.message || 'Falha de conexão'}`, 'error');
        }
    }

    renderOverviewMetrics() {
        let totalSpend = 0;
        let totalRevenue = 0;
        let totalPurchases = 0;
        let totalClicks = 0;
        let totalImpressions = 0;

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

        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;
        const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;
        const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const overallCpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;

        const breakEven = window.analyticsEngine.calculateBreakEven();

        // Cards Principais
        document.getElementById('kpi-spend').textContent = window.analyticsEngine.formatMoney(totalSpend);
        document.getElementById('kpi-revenue').textContent = window.analyticsEngine.formatMoney(totalRevenue);
        document.getElementById('kpi-purchases').textContent = `${totalPurchases} un`;
        document.getElementById('kpi-cpa').textContent = window.analyticsEngine.formatMoney(avgCpa);
        document.getElementById('kpi-roas').textContent = `${avgRoas.toFixed(2)}x`;
        document.getElementById('kpi-ctr').textContent = `${overallCtr.toFixed(2)}%`;
        document.getElementById('kpi-cpc').textContent = window.analyticsEngine.formatMoney(overallCpc);

        // Health Score
        const health = window.analyticsEngine.calculateHealthScore(allMetrics, breakEven);
        const healthEl = document.getElementById('account-health-number');
        const healthBadge = document.getElementById('account-health-badge');
        if (healthEl) healthEl.textContent = `${health.score}/100`;
        if (healthBadge) {
            healthBadge.textContent = health.status;
            healthBadge.className = `badge ${health.status === 'SAUDÁVEL' ? 'badge-active' : 'badge-paused'}`;
        }
    }

    renderCampaignsTable() {
        const tbody = document.getElementById('campaigns-table-body');
        const mobileContainer = document.getElementById('campaigns-mobile-cards');
        if (!tbody) return;

        let filtered = this.cachedCampaigns;
        if (this.searchQuery) {
            filtered = filtered.filter(c => c.name.toLowerCase().includes(this.searchQuery));
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500 italic">Nenhuma campanha correspondente aos filtros.</td></tr>`;
            if (mobileContainer) mobileContainer.innerHTML = `<p class="text-xs text-gray-500 text-center py-6">Nenhuma campanha encontrada.</p>`;
            return;
        }

        tbody.innerHTML = filtered.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const isChecked = camp.status === 'ACTIVE';
            const isProtected = window.guardrailEngine?.isProtectedWinner(camp.id);
            const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : 0;
            const evalResult = window.decisionEngine.evaluateCreative(ins, window.guardrailEngine.config.targetCPA);

            return `
                <tr class="hover:bg-white/[0.02] border-b border-brand-border transition-colors text-xs">
                    <td class="p-3.5">
                        <div class="flex items-center space-x-2">
                            <span class="w-2 h-2 rounded-full ${isChecked ? 'bg-emerald-400' : 'bg-red-400'}"></span>
                            <span class="font-semibold text-white truncate max-w-[220px]" title="${camp.name}">${camp.name}</span>
                            ${isProtected ? '<span class="text-[9px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-1.5 py-0.5 rounded font-bold">WINNER</span>' : ''}
                        </div>
                        <span class="text-[10px] text-gray-400 block mt-0.5">${camp.objective || 'Vendas'}</span>
                    </td>
                    <td class="p-3.5 tabular-nums text-white font-medium">
                        ${window.analyticsEngine.formatMoney(ins.spend)}
                    </td>
                    <td class="p-3.5 tabular-nums text-white font-bold">
                        ${ins.purchases}
                    </td>
                    <td class="p-3.5 tabular-nums text-white font-medium">
                        ${window.analyticsEngine.formatMoney(ins.cpa)}
                    </td>
                    <td class="p-3.5 tabular-nums text-white font-medium">
                        ${ins.roas.toFixed(2)}x
                    </td>
                    <td class="p-3.5 tabular-nums text-gray-300">
                        ${ins.ctr.toFixed(2)}%
                    </td>
                    <td class="p-3.5">
                        <span class="badge ${evalResult.classification === 'WINNER' || evalResult.classification === 'SCALING' ? 'badge-winner' : (evalResult.classification === 'FATIGUE' ? 'badge-fatigue' : 'badge-active')}">
                            ${evalResult.classification}
                        </span>
                    </td>
                    <td class="p-3.5 text-right space-x-1.5">
                        <button onclick="window.dashboard.openBudgetModal('${camp.id}', ${budgetVal})" class="btn-secondary text-[11px] py-1 px-2.5">
                            R$ ${budgetVal.toFixed(0)}/d
                        </button>
                        <button onclick="window.dashboard.toggleCampaignStatus('${camp.id}', '${isChecked ? 'PAUSED' : 'ACTIVE'}')" class="${isChecked ? 'btn-danger' : 'btn-primary'} text-[11px] py-1 px-2.5">
                            ${isChecked ? 'Pausar' : 'Ativar'}
                        </button>
                        <button onclick="window.dashboard.openDrawer('${camp.id}')" class="btn-secondary text-[11px] py-1 px-2">
                            Detalhes
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Renderização para Mobile
        if (mobileContainer) {
            mobileContainer.innerHTML = filtered.map(camp => {
                const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
                const isChecked = camp.status === 'ACTIVE';
                const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : 0;

                return `
                    <div class="glass-panel p-4 rounded-2xl space-y-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                                <span class="w-2 h-2 rounded-full ${isChecked ? 'bg-emerald-400' : 'bg-red-400'}"></span>
                                <p class="font-bold text-white text-sm truncate max-w-[200px]">${camp.name}</p>
                            </div>
                            <span class="badge ${isChecked ? 'badge-active' : 'badge-paused'}">${camp.status}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-white/5">
                            <div>
                                <span class="text-[10px] text-gray-400 uppercase">Gasto</span>
                                <p class="font-bold text-white">${window.analyticsEngine.formatMoney(ins.spend)}</p>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 uppercase">Vendas</span>
                                <p class="font-bold text-white">${ins.purchases}</p>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 uppercase">CPA</span>
                                <p class="font-bold text-white">${window.analyticsEngine.formatMoney(ins.cpa)}</p>
                            </div>
                        </div>
                        <div class="flex items-center justify-end space-x-2 pt-2 border-t border-white/5">
                            <button onclick="window.dashboard.openBudgetModal('${camp.id}', ${budgetVal})" class="btn-secondary text-xs flex-1">
                                Orçamento
                            </button>
                            <button onclick="window.dashboard.toggleCampaignStatus('${camp.id}', '${isChecked ? 'PAUSED' : 'ACTIVE'}')" class="${isChecked ? 'btn-danger' : 'btn-primary'} text-xs flex-1">
                                ${isChecked ? 'Pausar' : 'Ativar'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    renderFunnelView() {
        let totalSpend = 0, totalRevenue = 0, totalPurchases = 0, totalClicks = 0, totalImpressions = 0, totalIC = 0, totalLPV = 0, totalPix = 0;

        this.cachedInsights.forEach(ins => {
            totalSpend += ins.spend;
            totalRevenue += ins.revenue;
            totalPurchases += ins.purchases;
            totalClicks += ins.clicks;
            totalImpressions += ins.impressions;
            totalIC += ins.initiateCheckout;
            totalLPV += ins.landingPageViews;
            totalPix += ins.pixCreated;
        });

        const funnelData = window.analyticsEngine.calculateFunnel({
            impressions: totalImpressions,
            clicks: totalClicks,
            landingPageViews: totalLPV,
            initiateCheckout: totalIC,
            pixCreated: totalPix,
            purchases: totalPurchases
        });

        const funnelContainer = document.getElementById('funnel-steps-container');
        if (funnelContainer) {
            funnelContainer.innerHTML = funnelData.steps.map((step, idx) => `
                <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <span class="w-6 h-6 rounded-full bg-yellow-400/10 text-yellow-400 flex items-center justify-center font-bold text-xs">${idx + 1}</span>
                        <div>
                            <p class="font-bold text-white text-sm">${step.name}</p>
                            <p class="text-xs text-gray-400">${step.value.toLocaleString('pt-BR')} eventos</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="font-mono text-sm font-bold text-emerald-400">${step.rate.toFixed(1)}%</span>
                        ${step.drop ? `<span class="text-[10px] text-red-400 block">-${step.drop.toFixed(1)}% queda</span>` : ''}
                    </div>
                </div>
            `).join('');
        }
    }

    renderCreativesView() {
        const grid = document.getElementById('creatives-grid-container');
        if (!grid) return;

        const evaluated = this.cachedCampaigns.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const evalResult = window.decisionEngine.evaluateCreative(ins, window.guardrailEngine.config.targetCPA);
            return { camp, ins, evalResult };
        });

        grid.innerHTML = evaluated.map(item => `
            <div class="glass-panel p-5 rounded-2xl space-y-3">
                <div class="flex items-center justify-between">
                    <span class="badge ${item.evalResult.classification === 'WINNER' ? 'badge-winner' : (item.evalResult.classification === 'FATIGUE' ? 'badge-fatigue' : 'badge-active')}">
                        ${item.evalResult.classification}
                    </span>
                    <span class="text-xs font-bold text-white font-mono">Score: ${item.evalResult.score}/100</span>
                </div>
                <h4 class="font-bold text-white text-sm truncate" title="${item.camp.name}">${item.camp.name}</h4>
                <div class="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/5">
                    <div>
                        <span class="text-[10px] text-gray-400">CTR Link</span>
                        <p class="font-bold text-white font-mono">${item.ins.ctr.toFixed(2)}%</p>
                    </div>
                    <div>
                        <span class="text-[10px] text-gray-400">CPA</span>
                        <p class="font-bold text-white font-mono">${window.analyticsEngine.formatMoney(item.ins.cpa)}</p>
                    </div>
                    <div>
                        <span class="text-[10px] text-gray-400">ROAS</span>
                        <p class="font-bold text-white font-mono">${item.ins.roas.toFixed(2)}x</p>
                    </div>
                    <div>
                        <span class="text-[10px] text-gray-400">Frequência</span>
                        <p class="font-bold text-white font-mono">${item.ins.frequency.toFixed(2)}</p>
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
                    <span class="font-bold text-yellow-400">${l.action}</span>
                    <span>${l.formattedDate} • ${l.formattedTime}</span>
                </div>
                <p class="text-white font-medium">${l.reason}</p>
                <div class="flex items-center justify-between text-[10px] text-gray-400 pt-1">
                    <span>Objeto: <b class="text-gray-300">${l.objectName}</b></span>
                    <span class="text-emerald-400 font-bold">${l.verification}</span>
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
                        <p class="font-bold text-white text-xs truncate">${opp.title}</p>
                        <p class="text-[11px] text-gray-400 truncate">${opp.reason}</p>
                    </div>
                </div>
                <span class="badge badge-winner text-[10px] flex-shrink-0">Score ${opp.score}</span>
            </div>
        `).join('');
    }

    // Modal de Alteração de Orçamento Customizado (Sem prompt())
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
            this.showToast('Enviando e verificando alteração de orçamento...', 'info');
            const res = await window.executionEngine.executeBudgetChange(campId, 'daily_budget', newBudgetCents, 'Ajuste manual pelo painel');
            this.showToast(res.message, 'success');
            await this.syncAllData();
        } catch (err) {
            this.showToast(`Erro: ${err.message}`, 'error');
        }
    }

    async toggleCampaignStatus(campaignId, newStatus) {
        try {
            this.showToast(`Alterando status para ${newStatus}...`, 'info');
            const res = await window.executionEngine.executeStatusChange(campaignId, newStatus, 'Ação rápida no dashboard');
            this.showToast(res.message, 'success');
            await this.syncAllData();
        } catch (err) {
            this.showToast(`Erro ao alterar status: ${err.message}`, 'error');
        }
    }

    // War Room (Auditoria Imediata 1-Clique)
    async runWarRoomAudit() {
        const modal = document.getElementById('war-room-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        const content = document.getElementById('war-room-content');
        content.innerHTML = `<p class="text-xs text-gray-400 animate-pulse text-center py-8">Auditoria em andamento: Analisando leilão, CPMs, rastreamento e conversões...</p>`;

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
                                    <span class="font-bold text-white">${d.campaignName}</span>
                                    <span class="badge ${d.actionType === 'PAUSE' ? 'badge-paused' : 'badge-active'}">${d.likelyCause}</span>
                                </div>
                                <p class="text-gray-300 text-[11px] mt-1">${d.recommendation}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch(e) {
            content.innerHTML = `<p class="text-xs text-red-400 text-center py-4">Erro ao processar War Room.</p>`;
        }
    }

    // Drawer Lateral
    async openDrawer(campaignId) {
        const drawer = document.getElementById('campaign-drawer');
        if (!drawer) return;

        drawer.classList.remove('translate-x-full');
        const content = document.getElementById('drawer-content');
        content.innerHTML = `<p class="text-xs text-gray-400 animate-pulse text-center py-8">Buscando AdSets e Criativos...</p>`;

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
                                    <span class="font-semibold text-white truncate max-w-[200px]">${adset.name}</span>
                                    <span class="badge ${adset.status === 'ACTIVE' ? 'badge-active' : 'badge-paused'}">${adset.status}</span>
                                </div>
                                <p class="text-[10px] text-gray-400">Meta: ${adset.optimization_goal || 'PURCHASE'}</p>
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
        const drawer = document.getElementById('campaign-drawer');
        if (drawer) drawer.classList.add('translate-x-full');
    }

    toggleCommandPalette() {
        const pal = document.getElementById('command-palette-modal');
        if (pal) pal.classList.toggle('hidden');
    }

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        this.closeDrawer();
    }

    showSetupModal() {
        const modal = document.getElementById('setup-modal');
        if (modal) modal.classList.remove('hidden');
    }
}

// Inicialização Global
window.dashboard = new DashboardApp();
document.addEventListener('DOMContentLoaded', () => window.dashboard.init());
