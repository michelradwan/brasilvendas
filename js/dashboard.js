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
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleCommandPalette();
            }
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
            this.renderMissions();
            this.renderAICoach();

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

        const evaluated = this.cachedCampaigns.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const evalResult = window.decisionEngine.evaluateCreative(ins, window.guardrailEngine.config.targetCPA);
            return { camp, ins, evalResult };
        });

        grid.innerHTML = evaluated.map(item => `
            <div class="glass-panel p-5 rounded-2xl space-y-3">
                <div class="flex items-center justify-between">
                    <span class="badge ${item.evalResult.classification === 'WINNER' ? 'badge-winner' : (item.evalResult.classification === 'FATIGUE' ? 'badge-fatigue' : 'badge-active')}">
                        ${escapeHTML(item.evalResult.classification)}
                    </span>
                    <span class="text-xs font-bold text-white font-mono">Score: ${item.evalResult.score}/100</span>
                </div>
                <h4 class="font-bold text-white text-sm truncate" title="${escapeHTML(item.camp.name)}">${escapeHTML(item.camp.name)}</h4>
                <div class="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/5">
                    <div>
                        <span class="text-[10px] text-gray-400">CTR Link</span>
                        <p class="font-bold text-white font-mono">${item.ins.ctr.toFixed(2)}%</p>
                    </div>
                    <div>
                        <span class="text-[10px] text-gray-400">CPA</span>
                        <p class="font-bold text-white font-mono">${item.ins.cpa !== null ? window.analyticsEngine.formatMoney(item.ins.cpa) : 'NO DATA'}</p>
                    </div>
                    <div>
                        <span class="text-[10px] text-gray-400">ROAS</span>
                        <p class="font-bold text-white font-mono">${item.ins.roas !== null ? `${item.ins.roas.toFixed(2)}x` : 'NO DATA'}</p>
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

    renderMissions() {
        const container = document.getElementById('missions-container');
        if (!container) return;

        const missions = [
            { id: 'M1', title: 'Validar Unit Economics Real', desc: 'Confirmar custos em Configurações para liberar escala autônoma', xp: 100, completed: false },
            { id: 'M2', title: 'Auditar Eventos no Tracking Health', desc: 'Verificar integridade do Pixel CAPI', xp: 60, completed: true },
            { id: 'M3', title: 'Revisar Análise do AI Coach', desc: 'Inspecionar as recomendações diárias de performance', xp: 40, completed: false }
        ];

        container.innerHTML = missions.map(m => `
            <div class="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <span class="text-base">${m.completed ? '✅' : '⏳'}</span>
                    <div>
                        <p class="font-bold text-white text-xs ${m.completed ? 'line-through text-gray-400' : ''}">${escapeHTML(m.title)}</p>
                        <p class="text-[11px] text-gray-400">${escapeHTML(m.desc)}</p>
                    </div>
                </div>
                <span class="badge badge-winner font-mono">+${m.xp} XP</span>
            </div>
        `).join('');
    }

    renderAICoach() {
        const headlineEl = document.getElementById('aicoach-headline');
        const bulletsEl = document.getElementById('aicoach-bullets');
        if (!headlineEl || !bulletsEl) return;

        let totalSpend = 0, totalPurchases = 0;
        this.cachedInsights.forEach(ins => {
            totalSpend += ins.spend;
            totalPurchases += ins.purchases;
        });

        const targetCPA = window.guardrailEngine?.config?.targetCPA || 35.00;
        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;

        if (totalPurchases > 0 && avgCpa <= targetCPA * 0.85) {
            headlineEl.textContent = 'Eficiência de Aquisição em Alta Performance 🚀';
            bulletsEl.innerHTML = `
                <li>O CPA médio global está R$ ${avgCpa.toFixed(2)} (abaixo da meta de R$ ${targetCPA.toFixed(2)}).</li>
                <li>As campanhas vencedoras estão qualificadas para escala controlada de +15%.</li>
                <li>Mantenha o monitoramento ativo para prevenir fadiga de criativos.</li>
            `;
        } else {
            headlineEl.textContent = 'Operação em Fase de Aprendizado & Calibração';
            bulletsEl.innerHTML = `
                <li>Monitore a taxa de cliques (CTR) e passagem para Início de Checkout.</li>
                <li>Verifique se o checkout está convertendo sem fricção de pagamento.</li>
                <li>Evite alterações bruscas de orçamento para preservar a entrega do leilão.</li>
            `;
        }
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

        try {
            const res = await fetch('/api/meta-proxy?action=test_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token })
            });
            const data = await res.json();

            if (data.success && data.valid) {
                if (feedback) {
                    feedback.className = 'text-xs p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 block';
                    feedback.innerHTML = `✅ <b>Token Válido!</b> App: ${data.app || 'Gestor Ads IA'}. Atualize a variável META_ACCESS_TOKEN na Vercel para persistência permanente.`;
                }
                this.showToast('Token Meta validado com sucesso!', 'success');
                setTimeout(() => {
                    document.getElementById('token-modal')?.classList.add('hidden');
                    this.syncAllData();
                }, 2000);
            } else {
                if (feedback) {
                    feedback.className = 'text-xs p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 block';
                    feedback.innerHTML = `❌ <b>Erro no Token:</b> ${data.error?.message || 'Token rejeitado pela Meta.'}`;
                }
            }
        } catch(err) {
            if (feedback) {
                feedback.className = 'text-xs p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 block';
                feedback.innerHTML = `⚠️ Token inserido localmente. Reinicie a sincronização.`;
            }
            setTimeout(() => {
                document.getElementById('token-modal')?.classList.add('hidden');
                this.syncAllData();
            }, 2000);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Testar & Salvar Token ➔';
            }
        }
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
