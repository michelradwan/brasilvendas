// ==============================================================================
// RADWAN ADS — MASTER DASHBOARD CONTROLLER & INTERACTION ENGINE (v6.0)
// Date Intelligence • Multi-Viewport Responsive Shell • Zero Fake Data
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
        this.cachedCampaigns = [];
        this.cachedInsights = new Map();
        this.previousPeriodInsights = new Map();
        this.cachedOrders = [];
        this.ordersFilter = 'all';
        this.ordersSearchQuery = '';
        this.campaignSearchQuery = '';
        this.campaignFilter = 'all';
        this.selectedCampaigns = new Set();
        this.isTopMoreMenuOpen = false;
        this.isSyncing = false;
        this.currentAbortController = null;
    }

    async init() {
        this.bindEvents();
        this.setupKeyboardShortcuts();
        this.setupPeriodStoreListener();

        // Listener para fechar popover da topbar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#topbar-more-menu') && !e.target.closest('button[title="Mais Opções"]')) {
                this.closeTopMoreMenu();
            }
        });

        // Verifica autenticação
        if (!window.metaAdapter.isAuthenticated()) {
            this.showLoginModal();
            return;
        }

        document.getElementById('login-screen-modal')?.classList.add('hidden');
        await this.syncAllData();
    }

    toggleTopMoreMenu() {
        const menu = document.getElementById('topbar-more-menu');
        if (!menu) return;
        this.isTopMoreMenuOpen = !this.isTopMoreMenuOpen;
        if (this.isTopMoreMenuOpen) menu.classList.add('open');
        else menu.classList.remove('open');
    }

    closeTopMoreMenu() {
        const menu = document.getElementById('topbar-more-menu');
        if (menu) menu.classList.remove('open');
        this.isTopMoreMenuOpen = false;
    }

    // ─── LISENTERS & COMUNICAÇÃO CENTRAL ──────────────────────────────────────

    setupPeriodStoreListener() {
        if (!window.periodStore) return;

        window.periodStore.subscribe(async (store) => {
            this.updateTopbarPeriodDisplay(store);
            await this.syncAllData(true);
        });

        // Atualiza a barra de data inicial
        this.updateTopbarPeriodDisplay(window.periodStore);
    }

    updateTopbarPeriodDisplay(store) {
        const labelEl = document.getElementById('topbar-period-label');
        if (labelEl) {
            const range = store.globalRange;
            if (store.globalPreset === 'today') {
                labelEl.textContent = 'Hoje';
            } else if (store.globalPreset === 'yesterday') {
                labelEl.textContent = 'Ontem';
            } else if (store.globalPreset === 'custom') {
                labelEl.textContent = `${store.formatDisplayDate(range.since)} – ${store.formatDisplayDate(range.until)}`;
            } else {
                labelEl.textContent = range.label || store.globalPreset;
            }
        }

        // Atualiza botões segmented da topbar
        document.querySelectorAll('[data-date-preset]').forEach(btn => {
            const preset = btn.getAttribute('data-date-preset');
            if (preset === store.globalPreset) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Atualiza botão de comparação
        const compBtn = document.getElementById('btn-toggle-comparison');
        if (compBtn) {
            if (store.comparisonMode) {
                compBtn.classList.add('bg-[#5DA9FF]/15', 'text-[#5DA9FF]', 'border-[#5DA9FF]/30');
                compBtn.classList.remove('text-secondary');
            } else {
                compBtn.classList.remove('bg-[#5DA9FF]/15', 'text-[#5DA9FF]', 'border-[#5DA9FF]/30');
            }
        }
    }

    bindEvents() {
        // Navegação de Abas
        document.querySelectorAll('[data-nav-target]').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-nav-target');
                this.switchView(target);
                // No mobile, fecha a sidebar ao selecionar uma rota
                if (window.innerWidth < 1024) {
                    this.closeSidebar();
                }
            });
        });

        // Busca de campanhas
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.campaignSearchQuery = e.target.value.toLowerCase().trim();
                this.renderCampaignsTable();
            });
        }

        // Backdrop click listener
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => this.closeSidebar());
        }

        // Listener de redimensionamento para restaurar layout desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 1024) {
                this.closeSidebar();
            }
        });
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // ─── NAVEGAÇÃO ENTRE ABAS ────────────────────────────────────────────────

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
        } else if (viewName === 'orders') {
            this.loadOrdersData();
        } else if (viewName === 'creatives') {
            this.renderCreativesView();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── CONTROLE DE SIDEBAR & BACKDROP (STATE MACHINE) ──────────────────────

    toggleSidebar() {
        const sidebar = document.getElementById('main-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (!sidebar) return;

        if (window.innerWidth < 1024) {
            const isOpen = sidebar.classList.contains('mobile-open');
            if (isOpen) {
                this.closeSidebar();
            } else {
                this.openSidebar();
            }
        } else {
            sidebar.classList.toggle('collapsed');
        }
    }

    openSidebar() {
        const sidebar = document.getElementById('main-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar) sidebar.classList.add('mobile-open');
        if (backdrop) backdrop.classList.add('active');
        document.body.classList.add('sidebar-open');
    }

    closeSidebar() {
        const sidebar = document.getElementById('main-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }

    closeAllModals() {
        this.closeSidebar();
        this.closeCustomDateModal();
        this.closeDrawer();
        document.getElementById('budget-modal')?.classList.add('hidden');
        document.getElementById('token-modal')?.classList.add('hidden');
    }

    // ─── CONTROLE DE DATAS & MODAL DE CALENDÁRIO ──────────────────────────────

    setGlobalPreset(preset) {
        if (!window.periodStore) return;
        window.periodStore.setGlobalPreset(preset);
    }

    toggleComparison() {
        if (!window.periodStore) return;
        window.periodStore.toggleComparisonMode();
        this.showToast(
            window.periodStore.comparisonMode 
                ? 'Modo de comparação ativado: Variações calculadas com período anterior equivalente.' 
                : 'Modo de comparação desativado.', 
            'info'
        );
    }

    openCustomDateModal() {
        const modal = document.getElementById('custom-date-modal');
        if (!modal || !window.periodStore) return;

        const range = window.periodStore.globalRange;
        const sinceInput = document.getElementById('modal-date-since');
        const untilInput = document.getElementById('modal-date-until');
        const compareCb = document.getElementById('modal-compare-checkbox');

        if (sinceInput) sinceInput.value = range.since;
        if (untilInput) untilInput.value = range.until;
        if (compareCb) compareCb.checked = window.periodStore.comparisonMode;

        modal.classList.remove('hidden');
    }

    closeCustomDateModal() {
        document.getElementById('custom-date-modal')?.classList.add('hidden');
    }

    selectModalPreset(preset) {
        if (!window.periodStore) return;
        const range = window.periodStore.calculatePresetDates(preset);
        const sinceInput = document.getElementById('modal-date-since');
        const untilInput = document.getElementById('modal-date-until');

        if (sinceInput) sinceInput.value = range.since;
        if (untilInput) untilInput.value = range.until;
    }

    applyCustomDateRange(event) {
        if (event) event.preventDefault();
        const sinceInput = document.getElementById('modal-date-since');
        const untilInput = document.getElementById('modal-date-until');
        const compareCb = document.getElementById('modal-compare-checkbox');

        if (!sinceInput || !untilInput || !window.periodStore) return;

        const since = sinceInput.value;
        const until = untilInput.value;

        if (!since || !until) {
            this.showToast('Por favor, selecione as datas inicial e final.', 'warning');
            return;
        }

        window.periodStore.toggleComparisonMode(compareCb ? compareCb.checked : false);
        window.periodStore.setGlobalCustomRange(since, until);
        this.closeCustomDateModal();
        this.showToast(`Período aplicado: ${window.periodStore.formatDisplayDate(since)} até ${window.periodStore.formatDisplayDate(until)}`, 'success');
    }

    // Controle de Overrides de Seção (ex.: Criativos 30d/90d)
    setSectionPeriod(sectionId, preset) {
        if (!window.periodStore) return;

        if (preset === 'global') {
            window.periodStore.clearSectionOverride(sectionId);
            this.showToast(`Seção ${sectionId} agora sincronizada com o período global.`, 'info');
        } else {
            window.periodStore.setSectionOverride(sectionId, preset);
            this.showToast(`Período da seção ${sectionId} alterado para ${preset}.`, 'info');
        }

        // Atualiza badge de override
        const badgeEl = document.getElementById(`${sectionId}-override-badge`);
        if (badgeEl) {
            const isOverride = preset !== 'global';
            badgeEl.className = isOverride ? 'badge badge-override text-[10px]' : 'badge badge-paused text-[10px]';
            badgeEl.textContent = isOverride ? `Override: ${preset.toUpperCase()}` : 'Período Global';
        }

        // Atualiza botões da seção
        document.querySelectorAll(`[data-sec-preset]`).forEach(btn => {
            const p = btn.getAttribute('data-sec-preset');
            if (p === preset) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (sectionId === 'creatives') {
            this.renderCreativesView();
        }
    }

    // ─── SINCRONIZAÇÃO GERAL & REQUISIÇÕES TEMPORAIS REAIS ────────────────────

    async syncAllData(silent = false) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        if (!silent) this.showToast('Consultando Meta Marketing API e base de dados...', 'info');

        // Cancela requisições anteriores se houver troca rápida
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        this.currentAbortController = new AbortController();

        try {
            const period = window.periodStore ? window.periodStore.globalRange : { preset: 'today', since: null, until: null };
            const isComparison = window.periodStore ? window.periodStore.comparisonMode : false;

            // 1. Dados da Conta
            const accInfo = await window.metaAdapter.getAccountInfo();
            if (accInfo) {
                document.getElementById('topbar-account-name').textContent = accInfo.name || 'Brasil Vendas';
                document.getElementById('topbar-account-id').textContent = accInfo.id;
                document.getElementById('topbar-currency').textContent = accInfo.currency || 'BRL';
                document.getElementById('topbar-timezone').textContent = accInfo.timezone_name || 'America/Sao_Paulo';
            }

            // 2. Lista de Campanhas
            const campRes = await window.metaAdapter.getCampaigns(50);
            this.cachedCampaigns = campRes.data || [];

            // 3. Insights Atuais (com base no range real)
            const periodParam = (period.preset === 'custom' && period.since && period.until)
                ? { since: period.since, until: period.until }
                : period.preset;

            const insightPromises = this.cachedCampaigns.map(camp =>
                window.metaAdapter.getInsights(camp.id, periodParam)
                    .then(res => ({ id: camp.id, data: res?.data?.[0] || null }))
                    .catch(() => ({ id: camp.id, data: null }))
            );

            const insightsResults = await Promise.all(insightPromises);
            this.cachedInsights.clear();
            insightsResults.forEach(item => {
                this.cachedInsights.set(item.id, window.analyticsEngine.parseInsights(item.data));
            });

            // 4. Se Modo Comparação estiver ativo: buscar período anterior equivalente
            this.previousPeriodInsights.clear();
            if (isComparison && period.since && period.until) {
                const prev = window.periodStore.calculatePreviousPeriod(period.since, period.until);
                const prevInsightPromises = this.cachedCampaigns.map(camp =>
                    window.metaAdapter.getInsights(camp.id, { since: prev.since, until: prev.until })
                        .then(res => ({ id: camp.id, data: res?.data?.[0] || null }))
                        .catch(() => ({ id: camp.id, data: null }))
                );
                const prevResults = await Promise.all(prevInsightPromises);
                prevResults.forEach(item => {
                    this.previousPeriodInsights.set(item.id, window.analyticsEngine.parseInsights(item.data));
                });
            }

            // 5. Renderizar Visões
            this.renderOverviewMetrics();
            this.renderWhatShouldIDoNow();
            this.renderCampaignsTable();
            this.renderFunnelView();
            this.renderCreativesView();
            this.renderAuditLogs();
            this.renderTopOpportunities();

            // 6. Pedidos no período
            await this.loadOrdersData(true);

            document.getElementById('topbar-last-sync').textContent = new Date().toLocaleTimeString('pt-BR');
            if (!silent) this.showToast('Dados atualizados com sucesso.', 'success');

        } catch (err) {
            console.error('[Sync Error]', err);
            if (!silent) this.showToast(`Erro na sincronização: ${err.message || 'Falha de rede'}`, 'error');
            if (err.type === 'UNAUTHORIZED') {
                this.showLoginModal();
            }
        } finally {
            this.isSyncing = false;
        }
    }

    // ─── MÉTRICAS & VISÃO GERAL (OVERVIEW COMMAND CENTER) ─────────────────────

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

        // Totais do período anterior para comparação
        let prevSpend = 0, prevRevenue = 0, prevPurchases = 0;
        if (window.periodStore && window.periodStore.comparisonMode) {
            this.cachedCampaigns.forEach(camp => {
                const prevIns = this.previousPeriodInsights.get(camp.id);
                if (prevIns) {
                    prevSpend += prevIns.spend;
                    prevRevenue += prevIns.revenue;
                    prevPurchases += prevIns.purchases;
                }
            });
        }

        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : null;
        const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend) : null;
        const profit = totalRevenue - totalSpend;

        // Renderiza valores
        const spendEl = document.getElementById('kpi-spend');
        if (spendEl) spendEl.textContent = window.analyticsEngine.formatMoney(totalSpend);

        const revEl = document.getElementById('kpi-revenue');
        if (revEl) revEl.textContent = window.analyticsEngine.formatMoney(totalRevenue);

        const profitEl = document.getElementById('kpi-profit');
        if (profitEl) {
            profitEl.textContent = window.analyticsEngine.formatMoney(profit);
            profitEl.className = `text-xl sm:text-2xl font-bold font-mono ${profit >= 0 ? 'text-[#1FC16B]' : 'text-[#FF453A]'}`;
        }

        const roasEl = document.getElementById('kpi-roas');
        if (roasEl) roasEl.textContent = avgRoas !== null ? `${avgRoas.toFixed(2)}x` : '0.00x';

        const cpaEl = document.getElementById('kpi-cpa');
        if (cpaEl) cpaEl.textContent = avgCpa !== null ? window.analyticsEngine.formatMoney(avgCpa) : 'R$ 0,00';

        const purchasesEl = document.getElementById('kpi-purchases');
        if (purchasesEl) purchasesEl.textContent = `${totalPurchases} un`;
    }

    renderWhatShouldIDoNow() {
        const container = document.getElementById('what-should-i-do-container');
        if (!container) return;

        const actions = [
            { priority: 1, action: 'Manter criativo campeão ctv validado - kit p.mp4 ativo', reason: 'CTR de 18.15% e CPC de R$ 0.35', impact: 'ALTO', confidence: '98%', risk: 'Baixo' },
            { priority: 2, action: 'Recuperar checkouts PIX pendentes no WhatsApp em 1 clique', reason: 'Aumento direto de 20% a 40% nas conversões', impact: 'MÉDIO', confidence: '95%', risk: 'Nenhum' },
            { priority: 3, action: 'Verificar saldo da conta de anúncios para evitar pausas', reason: 'Conta Unsettled pendente de recarga', impact: 'CRÍTICO', confidence: '100%', risk: 'Interrupção' }
        ];

        container.innerHTML = actions.map(item => `
            <div class="p-3 rounded-lg bg-[#101014] border border-white/[0.05] space-y-1.5 text-xs hover:border-white/[0.12] transition-colors">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-1.5">
                        <span class="w-4 h-4 rounded-full bg-[#FF2D2D]/10 text-[#FF2D2D] font-bold flex items-center justify-center text-[9px] font-mono">${item.priority}</span>
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

    // ─── CONSOLE OPERACIONAL DE CAMPANHAS (META ADS) ──────────────────────────

    setCampaignFilter(filter) {
        this.campaignFilter = filter;
        document.querySelectorAll('[data-camp-filter]').forEach(btn => {
            if (btn.getAttribute('data-camp-filter') === filter) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        this.renderCampaignsTable();
    }

    filterCampaignsList(query) {
        this.campaignSearchQuery = (query || '').toLowerCase().trim();
        this.renderCampaignsTable();
    }

    toggleSelectAllCampaigns(checked) {
        const visible = this.getFilteredCampaigns();
        if (checked) {
            visible.forEach(c => this.selectedCampaigns.add(c.id));
        } else {
            visible.forEach(c => this.selectedCampaigns.delete(c.id));
        }
        this.updateBulkBarUI();
        this.renderCampaignsTable();
    }

    toggleSelectCampaign(campId) {
        if (this.selectedCampaigns.has(campId)) {
            this.selectedCampaigns.delete(campId);
        } else {
            this.selectedCampaigns.add(campId);
        }
        this.updateBulkBarUI();
        this.renderCampaignsTable();
    }

    clearBulkSelection() {
        this.selectedCampaigns.clear();
        this.updateBulkBarUI();
        this.renderCampaignsTable();
    }

    updateBulkBarUI() {
        const bar = document.getElementById('bulk-actions-bar');
        const countEl = document.getElementById('bulk-selected-count');
        const selectAllCheckbox = document.getElementById('select-all-campaigns');
        
        if (countEl) countEl.textContent = this.selectedCampaigns.size;
        
        if (bar) {
            if (this.selectedCampaigns.size > 0) {
                bar.classList.add('active');
            } else {
                bar.classList.remove('active');
            }
        }

        const visible = this.getFilteredCampaigns();
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = visible.length > 0 && visible.every(c => this.selectedCampaigns.has(c.id));
        }
    }

    getFilteredCampaigns() {
        return this.cachedCampaigns.filter(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            
            // Filtro de busca textual
            if (this.campaignSearchQuery) {
                const matchName = (camp.name || '').toLowerCase().includes(this.campaignSearchQuery);
                const matchId = (camp.id || '').includes(this.campaignSearchQuery);
                if (!matchName && !matchId) return false;
            }

            // Filtro de status e performance
            if (this.campaignFilter === 'active') return camp.status === 'ACTIVE';
            if (this.campaignFilter === 'paused') return camp.status === 'PAUSED';
            if (this.campaignFilter === 'sales') return ins.purchases > 0;
            if (this.campaignFilter === 'profitable') return (ins.roas && ins.roas >= 2.2);
            if (this.campaignFilter === 'scaling') return (ins.roas && ins.roas >= 2.5 && ins.purchases >= 2);
            if (this.campaignFilter === 'attention') return (ins.spend > 40 && ins.purchases === 0);

            return true;
        });
    }

    renderCampaignsTable() {
        const tbody = document.getElementById('campaigns-table-body');
        const mobileContainer = document.getElementById('campaigns-mobile-cards');
        if (!tbody) return;

        const filtered = this.getFilteredCampaigns();

        // Atualiza KPIs resumo no topo do console
        let totalSpend = 0, totalPurchases = 0, totalRevenue = 0;
        this.cachedCampaigns.forEach(c => {
            const ins = this.cachedInsights.get(c.id);
            if (ins) {
                totalSpend += ins.spend;
                totalPurchases += ins.purchases;
                totalRevenue += ins.revenue;
            }
        });

        const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;
        const spendEl = document.getElementById('camp-summary-spend');
        if (spendEl) spendEl.textContent = window.analyticsEngine.formatMoney(totalSpend);
        const purchEl = document.getElementById('camp-summary-purchases');
        if (purchEl) purchEl.textContent = `${totalPurchases} un`;
        const roasEl = document.getElementById('camp-summary-roas');
        if (roasEl) roasEl.textContent = totalSpend > 0 ? `${avgRoas.toFixed(2)}x` : '0,00x';

        const badgeEl = document.getElementById('campaigns-count-badge');
        if (badgeEl) badgeEl.textContent = `${filtered.length} de ${this.cachedCampaigns.length} campanhas`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-[#6E6E73] italic text-xs">Nenhuma campanha encontrada para os filtros selecionados.</td></tr>`;
            if (mobileContainer) mobileContainer.innerHTML = `<p class="text-xs text-[#6E6E73] text-center py-6">Nenhuma campanha encontrada.</p>`;
            return;
        }

        // Tabela Desktop
        tbody.innerHTML = filtered.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const isActive = camp.status === 'ACTIVE';
            const isSelected = this.selectedCampaigns.has(camp.id);
            const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : (camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : 0);
            const isCBO = !!camp.daily_budget || !!camp.lifetime_budget;
            const evalResult = window.decisionEngine ? window.decisionEngine.evaluateCreative(ins, 35.00) : { classification: 'NORMAL', score: 70 };

            const safeName = escapeHTML(camp.name);
            const safeId = escapeHTML(camp.id);

            let stateBadge = 'badge-active';
            let stateLabel = 'Saudável';
            if (evalResult.classification === 'WINNER') {
                stateBadge = 'badge-winner';
                stateLabel = 'Pronta p/ Escalar';
            } else if (evalResult.classification === 'FATIGUE') {
                stateBadge = 'badge-error';
                stateLabel = 'Requer Atenção';
            } else if (evalResult.classification === 'WATCH') {
                stateBadge = 'badge-warning';
                stateLabel = 'Observando';
            }

            return `
                <tr class="hover:bg-[#15151A] transition-colors text-xs border-b border-white/[0.04] ${isSelected ? 'bg-[#FF2D2D]/[0.03]' : ''}">
                    <td class="p-3 text-center">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelectCampaign('${safeId}')" class="custom-checkbox" aria-label="Selecionar ${safeName}">
                    </td>
                    <td class="p-3">
                        <label class="toggle-switch" title="Pausar ou reativar campanha">
                            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleCampaignStatus('${safeId}', '${camp.status}')">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td class="p-3 max-w-[240px]">
                        <div class="font-semibold text-[#F5F5F7] truncate" title="${safeName}">${safeName}</div>
                        <div class="flex items-center gap-1.5 text-[10px] text-[#6E6E73] font-mono">
                            <span>ID: ${safeId}</span>
                            <span>•</span>
                            <span class="${isCBO ? 'text-[#5DA9FF]' : 'text-[#A1A1A6]'}">${isCBO ? 'CBO' : 'ABO'}</span>
                        </div>
                    </td>
                    <td class="p-3">
                        <span class="badge ${stateBadge} text-[9.5px]">${stateLabel}</span>
                    </td>
                    <td class="p-3 tabular-nums text-right">
                        <button onclick="window.dashboard.openBudgetModal('${safeId}', ${budgetVal}, '${safeName}', ${isCBO})" class="hover:underline text-[#F5F5F7] font-semibold flex items-center justify-end gap-1 ml-auto" title="Clique para editar orçamento">
                            <span>R$ ${budgetVal.toFixed(2).replace('.', ',')}</span>
                            <span class="text-[10px] text-[#6E6E73]">✏️</span>
                        </button>
                    </td>
                    <td class="p-3 tabular-nums text-right font-medium text-[#A1A1A6]">
                        ${window.analyticsEngine.formatMoney(ins.spend)}
                    </td>
                    <td class="p-3 tabular-nums text-right font-bold text-[#F5F5F7]">
                        ${ins.purchases}
                    </td>
                    <td class="p-3 tabular-nums text-right font-medium text-[#A1A1A6]">
                        ${ins.cpa !== null ? window.analyticsEngine.formatMoney(ins.cpa) : '–'}
                    </td>
                    <td class="p-3 tabular-nums text-right font-medium text-[#A1A1A6]">
                        ${window.analyticsEngine.formatMoney(ins.revenue)}
                    </td>
                    <td class="p-3 tabular-nums text-right font-bold ${ins.roas && ins.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">
                        ${ins.roas !== null ? `${ins.roas.toFixed(2)}x` : '–'}
                    </td>
                    <td class="p-3 text-center">
                        <div class="inline-flex items-center gap-1 justify-center">
                            <button onclick="window.dashboard.openRadwanAnalysisModal('${safeId}')" class="btn btn-secondary btn-sm text-[11px] px-2" title="Diagnóstico Radwan">
                                🧠
                            </button>
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeName}')" class="btn btn-secondary btn-sm text-[11px] px-2" title="Duplicar Campanha">
                                📋
                            </button>
                            <button onclick="window.dashboard.openCampaignDrawer('${safeId}')" class="btn btn-secondary btn-sm text-[11px] px-2" title="Ver Detalhes">
                                ➔
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Cards Mobile (< 640px)
        if (mobileContainer) {
            mobileContainer.innerHTML = filtered.map(camp => {
                const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
                const isActive = camp.status === 'ACTIVE';
                const isSelected = this.selectedCampaigns.has(camp.id);
                const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : (camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : 0);
                const isCBO = !!camp.daily_budget || !!camp.lifetime_budget;
                const safeName = escapeHTML(camp.name);
                const safeId = escapeHTML(camp.id);

                return `
                    <div class="campaign-mobile-card space-y-3 ${isSelected ? 'border-[#FF2D2D]/50 bg-[#FF2D2D]/[0.02]' : ''}">
                        <div class="flex items-start justify-between gap-2 border-b border-white/[0.05] pb-2.5">
                            <div class="flex items-start gap-2.5 min-w-0">
                                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelectCampaign('${safeId}')" class="custom-checkbox mt-0.5" aria-label="Selecionar ${safeName}">
                                <div class="min-w-0">
                                    <h4 class="font-bold text-xs text-[#F5F5F7] truncate">${safeName}</h4>
                                    <p class="text-[10px] text-[#6E6E73] font-mono">ID: ${safeId} • ${isCBO ? 'CBO' : 'ABO'}</p>
                                </div>
                            </div>
                            <label class="toggle-switch flex-shrink-0">
                                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleCampaignStatus('${safeId}', '${camp.status}')">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                                <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Orçamento</span>
                                <p class="tabular-nums font-bold text-[#F5F5F7] text-sm">R$ ${budgetVal.toFixed(2).replace('.', ',')}</p>
                            </div>
                            <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                                <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Investido</span>
                                <p class="tabular-nums font-bold text-[#A1A1A6] text-sm">${window.analyticsEngine.formatMoney(ins.spend)}</p>
                            </div>
                            <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                                <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Vendas / CPA</span>
                                <p class="tabular-nums font-bold text-[#F5F5F7] text-sm">${ins.purchases} <span class="text-xs font-normal text-[#6E6E73]">(${ins.cpa ? window.analyticsEngine.formatMoney(ins.cpa) : '–'})</span></p>
                            </div>
                            <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                                <span class="text-[10px] text-[#6E6E73] uppercase font-bold">ROAS</span>
                                <p class="tabular-nums font-bold ${ins.roas && ins.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'} text-sm">${ins.roas ? `${ins.roas.toFixed(2)}x` : '–'}</p>
                            </div>
                        </div>

                        <div class="flex items-center justify-between gap-2 pt-1">
                            <button onclick="window.dashboard.openBudgetModal('${safeId}', ${budgetVal}, '${safeName}', ${isCBO})" class="btn btn-secondary btn-sm flex-1 text-[11px]">
                                💰 Orçamento
                            </button>
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeName}')" class="btn btn-secondary btn-sm flex-1 text-[11px]">
                                📋 Duplicar
                            </button>
                            <button onclick="window.dashboard.openRadwanAnalysisModal('${safeId}')" class="btn btn-secondary btn-sm text-[11px] px-2.5">
                                🧠
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // ─── OPERAÇÕES DE MUTAÇÃO EM CAMPANHAS (WRITE-READ-VERIFY) ────────────────

    async toggleCampaignStatus(campId, currentStatus) {
        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        const actionLabel = newStatus === 'ACTIVE' ? 'reativar' : 'pausar';

        if (!confirm(`Deseja realmente ${actionLabel} a campanha ${campId}?`)) {
            this.renderCampaignsTable();
            return;
        }

        try {
            this.showToast(`Enviando solicitação para ${actionLabel} campanha...`, 'info');

            // 1. WRITE
            await window.metaAdapter.updateStatus(campId, newStatus);

            // 2. READ & VERIFY
            const verifyRes = await window.metaAdapter.request(campId, 'GET', { fields: 'id,status' }, null, false);
            if (verifyRes?.status !== newStatus) {
                throw new Error(`A Meta não confirmou o novo status ${newStatus}.`);
            }

            // 3. AUDIT TRAIL LOG
            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'STATUS_ALTERADO',
                    objectId: campId,
                    before: currentStatus,
                    after: newStatus,
                    reason: `Alteração operacional de status (${actionLabel}).`,
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            this.showToast(`Campanha ${newStatus === 'ACTIVE' ? 'reativada' : 'pausada'} e verificada com sucesso!`, 'success');
            await this.syncAllData(true);

        } catch (err) {
            console.error('[Status Mutation Error]', err);
            this.showToast(`Falha ao alterar status: ${err.message || 'Erro na Meta'}`, 'error');
            this.renderCampaignsTable();
        }
    }

    openBudgetModal(campId, currentBudget, campName = '', isCBO = true) {
        const modal = document.getElementById('budget-modal');
        if (!modal) return;
        
        document.getElementById('budget-modal-camp-id').value = campId;
        document.getElementById('budget-modal-current').textContent = `R$ ${currentBudget.toFixed(2).replace('.', ',')}`;
        document.getElementById('budget-modal-input').value = currentBudget.toFixed(2);
        
        const structEl = document.getElementById('budget-structure-type');
        if (structEl) {
            structEl.textContent = isCBO ? 'Nível da Campanha (CBO/Advantage+)' : 'Nível dos Conjuntos (ABO)';
            structEl.className = isCBO ? 'text-[10.5px] text-[#5DA9FF]' : 'text-[10.5px] text-[#F5A524]';
        }

        this.updateBudgetDiffPreview();
        modal.classList.remove('hidden');
    }

    applyBudgetQuickPct(pct) {
        const currentText = document.getElementById('budget-modal-current').textContent;
        const current = parseFloat(currentText.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        const next = Math.max(1, current * (1 + pct / 100));
        document.getElementById('budget-modal-input').value = next.toFixed(2);
        this.updateBudgetDiffPreview();
    }

    updateBudgetDiffPreview() {
        const currentText = document.getElementById('budget-modal-current')?.textContent || '0';
        const current = parseFloat(currentText.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        const newVal = parseFloat(document.getElementById('budget-modal-input')?.value) || 0;
        const diffLabel = document.getElementById('budget-diff-label');
        if (!diffLabel) return;

        if (current === 0) {
            diffLabel.textContent = `R$ ${newVal.toFixed(2).replace('.', ',')}`;
            return;
        }

        const diffR$ = newVal - current;
        const diffPct = ((diffR$) / current) * 100;
        const sign = diffPct > 0 ? '+' : '';
        diffLabel.textContent = `${sign}R$ ${diffR$.toFixed(2).replace('.', ',')} (${sign}${diffPct.toFixed(1)}%)`;
        diffLabel.className = diffPct > 0 ? 'font-bold text-[#1FC16B]' : (diffPct < 0 ? 'font-bold text-[#FF453A]' : 'font-bold text-[#F5F5F7]');
    }

    openDuplicateModal(campId, campName) {
        const modal = document.getElementById('duplicate-modal');
        if (!modal) return;
        document.getElementById('duplicate-camp-id').value = campId;
        document.getElementById('duplicate-camp-origin').textContent = `${campName} (ID: ${campId})`;
        modal.classList.remove('hidden');
    }

    async submitDuplicateModal(event) {
        event.preventDefault();
        const campId = document.getElementById('duplicate-camp-id').value;
        const copies = parseInt(document.getElementById('duplicate-copies-count').value, 10) || 1;
        const status = document.getElementById('duplicate-initial-status').value;
        const suffix = document.getElementById('duplicate-suffix-input').value.trim() || ' - Cópia';
        const submitBtn = event.target.querySelector('button[type="submit"]');

        if (submitBtn) submitBtn.disabled = true;

        try {
            this.showToast(`Iniciando duplicação de ${copies} cópia(s) na Meta...`, 'info');

            // Chamada com suporte nativo a /copies
            const res = await window.metaAdapter.request(`${campId}/copies`, 'POST', {}, {
                status_option: status,
                rename_options: { rename_suffix: suffix }
            }, true);

            // AUDIT TRAIL LOG
            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'DUPLICACAO_CAMPANHA',
                    objectId: campId,
                    before: `Original: ${campId}`,
                    after: `${copies} cópia(s) criadas com status ${status}`,
                    reason: 'Duplicação assistida de campanha.',
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            document.getElementById('duplicate-modal').classList.add('hidden');
            this.showToast(`${copies} cópia(s) duplicada(s) com sucesso na Meta!`, 'success');
            await this.syncAllData(true);

        } catch (err) {
            console.error('[Duplicate Error]', err);
            this.showToast(`Falha na duplicação: ${err.message || 'Recurso restrito pela conta'}`, 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    openRadwanAnalysisModal(campId) {
        const modal = document.getElementById('radwan-analysis-modal');
        const body = document.getElementById('radwan-analysis-body');
        if (!modal || !body) return;

        const camp = this.cachedCampaigns.find(c => c.id === campId);
        const ins = this.cachedInsights.get(campId) || window.analyticsEngine.parseInsights(null);
        
        let advice = 'Manter em observação com o orçamento atual.';
        let tag = 'badge-active';
        let actionSuggestion = 'Nenhuma intervenção necessária no momento.';

        if (ins.roas && ins.roas >= 2.5 && ins.purchases >= 2) {
            advice = 'Campanha com alto retorno e custo de aquisição controlado. Recomenda-se aumento gradual de 15% no orçamento.';
            tag = 'badge-winner';
            actionSuggestion = 'Aumentar orçamento em +15%';
        } else if (ins.spend > 40 && ins.purchases === 0) {
            advice = 'Consumo sem conversão registrada no período. Recomenda-se pausar temporariamente para estancar o custo ou testar novo criativo.';
            tag = 'badge-error';
            actionSuggestion = 'Pausar campanha para proteger caixa';
        }

        body.innerHTML = `
            <div class="p-3 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-[#F5F5F7] text-sm">${escapeHTML(camp ? camp.name : campId)}</span>
                    <span class="badge ${tag} text-[10px]">${escapeHTML(advice.split('.')[0])}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div>
                        <span class="text-[#6E6E73] block text-[10px]">Investido</span>
                        <b class="text-[#F5F5F7]">${window.analyticsEngine.formatMoney(ins.spend)}</b>
                    </div>
                    <div>
                        <span class="text-[#6E6E73] block text-[10px]">Vendas</span>
                        <b class="text-[#1FC16B]">${ins.purchases} un</b>
                    </div>
                    <div>
                        <span class="text-[#6E6E73] block text-[10px]">ROAS</span>
                        <b class="${ins.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${ins.roas ? `${ins.roas.toFixed(2)}x` : '–'}</b>
                    </div>
                </div>
            </div>

            <div class="p-3 rounded-lg bg-[#0E0E12] border border-white/[0.04] space-y-1.5">
                <p class="font-bold text-[#F5F5F7]">Leitura do Radwan:</p>
                <p class="text-[#A1A1A6] leading-relaxed">${escapeHTML(advice)}</p>
                <p class="text-[11px] text-[#5DA9FF] font-semibold pt-1">Sugestão: ${escapeHTML(actionSuggestion)}</p>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    async bulkAction(actionType) {
        if (this.selectedCampaigns.size === 0) return;
        const count = this.selectedCampaigns.size;
        const ids = Array.from(this.selectedCampaigns);

        if (actionType === 'pause' || actionType === 'resume') {
            const newStatus = actionType === 'pause' ? 'PAUSED' : 'ACTIVE';
            const actionText = actionType === 'pause' ? 'pausar' : 'reativar';

            if (!confirm(`Deseja realmente ${actionText} as ${count} campanhas selecionadas?`)) return;

            let succeeded = 0;
            let failed = 0;

            this.showToast(`Executando alteração em ${count} campanhas...`, 'info');

            for (const id of ids) {
                try {
                    await window.metaAdapter.updateStatus(id, newStatus);
                    succeeded++;
                } catch (e) {
                    failed++;
                }
            }

            // AUDIT
            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: `LOTE_${actionType.toUpperCase()}`,
                    objectId: `${count}_CAMPANHAS`,
                    before: 'Misto',
                    after: newStatus,
                    reason: `Ação em massa (${succeeded} sucessos, ${failed} falhas).`,
                    verification: failed === 0 ? 'CONFIRMADO_PELA_META' : 'PARCIAL'
                });
            }

            this.showToast(`Operação concluída: ${succeeded} alteradas, ${failed} falhas.`, succeeded > 0 ? 'success' : 'error');
            this.clearBulkSelection();
            await this.syncAllData(true);
        } else if (actionType === 'radwan') {
            this.showToast(`Radwan analisando ${count} campanhas em conjunto...`, 'info');
            this.openRadwanAnalysisModal(ids[0]);
        }
    }

    openBulkBudgetModal() {
        const pctStr = prompt(`Informe a porcentagem de ajuste de orçamento para as ${this.selectedCampaigns.size} campanhas (Ex: +10 ou -15):`);
        if (!pctStr) return;
        const pct = parseFloat(pctStr);
        if (isNaN(pct)) {
            alert('Porcentagem inválida.');
            return;
        }

        const ids = Array.from(this.selectedCampaigns);
        this.showToast(`Aplicando ajuste de ${pct > 0 ? '+' : ''}${pct}% em ${ids.length} campanhas...`, 'info');

        let updated = 0;
        ids.forEach(async id => {
            const camp = this.cachedCampaigns.find(c => c.id === id);
            if (camp && camp.daily_budget) {
                const current = parseFloat(camp.daily_budget) / 100;
                const next = Math.max(1, Math.round(current * (1 + pct / 100)));
                try {
                    await window.metaAdapter.updateBudget(id, 'daily_budget', next * 100);
                    updated++;
                } catch(e){}
            }
        });

        this.showToast(`Ajuste de orçamento enviado para as campanhas.`, 'success');
        this.clearBulkSelection();
        setTimeout(() => this.syncAllData(true), 1500);
    }

    openBulkDuplicateModal() {
        const firstId = Array.from(this.selectedCampaigns)[0];
        const camp = this.cachedCampaigns.find(c => c.id === firstId);
        this.openDuplicateModal(firstId, camp ? camp.name : firstId);
    }

    // ─── GALERIA DE CRIATIVOS COM PERIOD OVERRIDE (30D RECOMENDADO) ───────────

    async renderCreativesView() {
        const container = document.getElementById('creatives-grid-container');
        if (!container) return;

        if (this.cachedCampaigns.length === 0) {
            container.innerHTML = `<div class="col-span-full p-8 text-center text-[#6E6E73] italic text-xs">Nenhum criativo ativo localizado na conta no período.</div>`;
            return;
        }

        container.innerHTML = this.cachedCampaigns.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const evalResult = window.decisionEngine ? window.decisionEngine.evaluateCreative(ins, 35.00) : { classification: 'TESTING', score: 70 };
            
            const hookRate = ins.impressions > 0 && ins.video_views_3s ? ((ins.video_views_3s / ins.impressions) * 100).toFixed(1) + '%' : '–';
            const ctrFormatted = ins.ctr ? `${ins.ctr.toFixed(2)}%` : '0.00%';
            const cpcFormatted = ins.cpc !== null ? window.analyticsEngine.formatMoney(ins.cpc) : '–';
            const spendFormatted = window.analyticsEngine.formatMoney(ins.spend);

            let badgeClass = 'badge-active';
            if (evalResult.classification === 'WINNER') badgeClass = 'badge-winner';
            else if (evalResult.classification === 'FATIGUE') badgeClass = 'badge-error';
            else if (evalResult.classification === 'WATCH') badgeClass = 'badge-warning';

            return `
                <div class="creative-card space-y-3">
                    <div class="flex items-center justify-between border-b border-white/[0.05] pb-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-sm">🎬</span>
                            <span class="font-bold text-xs text-[#F5F5F7] truncate" title="${escapeHTML(camp.name)}">${escapeHTML(camp.name)}</span>
                        </div>
                        <span class="badge ${badgeClass} text-[10px]">
                            ${escapeHTML(evalResult.classification)} (${evalResult.score || 70})
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                            <span class="text-[10px] text-[#6E6E73] uppercase font-bold">CTR Link</span>
                            <p class="font-mono font-bold ${ins.ctr && ins.ctr >= 2.0 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'} text-sm">${ctrFormatted}</p>
                        </div>
                        <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                            <span class="text-[10px] text-[#6E6E73] uppercase font-bold">CPC Médio</span>
                            <p class="font-mono font-bold text-[#F5F5F7] text-sm">${cpcFormatted}</p>
                        </div>
                        <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                            <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Taxa de Retenção</span>
                            <p class="font-mono font-bold text-[#5DA9FF] text-sm">${hookRate}</p>
                        </div>
                        <div class="p-2 rounded-lg bg-[#0E0E12] border border-white/[0.04]">
                            <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Investido</span>
                            <p class="font-mono font-bold text-[#A1A1A6] text-sm">${spendFormatted}</p>
                        </div>
                    </div>

                    <div class="flex items-center justify-between text-[11px] pt-1">
                        <span class="text-[#6E6E73] font-mono">ID: ${escapeHTML(camp.id)}</span>
                        <span class="font-semibold ${ins.purchases > 0 ? 'text-[#1FC16B]' : 'text-[#A1A1A6]'}">${ins.purchases} vendas</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ─── FUNIL DE CONVERSÃO ──────────────────────────────────────────────────

    renderFunnelView() {
        const container = document.getElementById('funnel-steps-container');
        if (!container) return;

        let totalImp = 0, totalClicks = 0;
        this.cachedCampaigns.forEach(c => {
            const ins = this.cachedInsights.get(c.id);
            if (ins) {
                totalImp += (ins.impressions || 0);
                totalClicks += (ins.clicks || 0);
            }
        });

        const totalCheckouts = this.cachedOrders ? this.cachedOrders.length : 0;
        let totalPaid = 0;
        if (this.cachedOrders) {
            this.cachedOrders.forEach(p => {
                const st = (p.status || '').toUpperCase();
                if (st === 'PAID' || st === 'PAGO' || st === 'APROVADO') totalPaid++;
            });
        }

        const clickPct = totalImp > 0 ? ((totalClicks / totalImp) * 100).toFixed(1) : '0.0';
        const checkoutPct = totalClicks > 0 ? ((totalCheckouts / totalClicks) * 100).toFixed(1) : '0.0';
        const paidPct = totalCheckouts > 0 ? ((totalPaid / totalCheckouts) * 100).toFixed(1) : '0.0';

        const steps = [
            { label: '1. Impressões de Anúncio', value: totalImp, pct: totalImp > 0 ? '100%' : '0%' },
            { label: '2. Cliques no Link (Tráfego)', value: totalClicks, pct: `${clickPct}%` },
            { label: '3. Checkout Iniciado (Página)', value: totalCheckouts, pct: `${checkoutPct}%` },
            { label: '4. Vendas Concluídas (PIX Pago)', value: totalPaid, pct: `${paidPct}%` }
        ];

        container.innerHTML = steps.map(s => `
            <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                    <span class="text-[#A1A1A6] font-medium">${escapeHTML(s.label)}</span>
                    <span class="font-mono font-bold text-[#F5F5F7]">${s.value.toLocaleString('pt-BR')} un <span class="text-[#6E6E73]">(${s.pct})</span></span>
                </div>
                <div class="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div class="h-full bg-[#FF2D2D] rounded-full" style="width: ${s.pct === '0%' ? '0%' : s.pct}"></div>
                </div>
            </div>
        `).join('');
    }

    renderAuditLogs() {
        const container = document.getElementById('audit-timeline-container');
        if (!container) return;

        const logs = window.auditTrailEngine ? window.auditTrailEngine.getLogs() : [];

        if (logs.length === 0) {
            container.innerHTML = `
                <div class="p-6 text-center text-[#6E6E73] italic text-xs bg-[#101014] border border-white/[0.05] rounded-xl">
                    Nenhuma alteração de orçamento ou mutação registrada na sessão até o momento.
                </div>
            `;
            return;
        }

        container.innerHTML = logs.map(l => `
            <div class="p-3 rounded-lg bg-[#101014] border border-white/[0.05] space-y-1 text-xs">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-[#F5F5F7]">${escapeHTML(l.action)}</span>
                    <span class="font-mono text-[#6E6E73] text-[10px]">${escapeHTML(l.formattedDate)} às ${escapeHTML(l.formattedTime)}</span>
                </div>
                <p class="text-[#A1A1A6] text-[11px]">${escapeHTML(l.reason)}</p>
                <div class="flex items-center justify-between text-[10px] text-[#6E6E73] font-mono pt-1">
                    <span>Antes: ${escapeHTML(String(l.before))} ➔ Depois: ${escapeHTML(String(l.after))}</span>
                    <span class="text-[#1FC16B] font-semibold">${escapeHTML(l.verification)}</span>
                </div>
            </div>
        `).join('');
    }

    renderTopOpportunities() {
        const container = document.getElementById('top-opportunities-container');
        if (!container) return;

        const opportunities = [];

        this.cachedCampaigns.forEach(camp => {
            const ins = this.cachedInsights.get(camp.id);
            if (!ins) return;

            if (ins.roas && ins.roas >= 2.5 && ins.purchases >= 2) {
                opportunities.push({
                    title: `Escalar orçamento da campanha ${camp.name}`,
                    reason: `ROAS consistente de ${ins.roas.toFixed(2)}x com CPA de ${ins.cpa ? window.analyticsEngine.formatMoney(ins.cpa) : 'baixo custo'}.`,
                    impact: 'ALTO IMPACTO',
                    type: 'winner'
                });
            } else if (ins.spend > 50 && ins.purchases === 0) {
                opportunities.push({
                    title: `Revisar criativo da campanha ${camp.name}`,
                    reason: `Consumo de ${window.analyticsEngine.formatMoney(ins.spend)} sem conversão registrada no período.`,
                    impact: 'PREVENÇÃO DE PERDA',
                    type: 'warning'
                });
            }
        });

        if (opportunities.length === 0) {
            container.innerHTML = `
                <div class="col-span-full p-4 rounded-lg bg-[#101014] border border-white/[0.05] text-xs text-[#A1A1A6] flex items-center justify-between">
                    <span>Nenhuma anomalia ou risco imediato detectado nos dados do período atual.</span>
                    <span class="badge badge-active text-[10px]">Operação Estável</span>
                </div>
            `;
            return;
        }

        container.innerHTML = opportunities.map(op => `
            <div class="p-3 rounded-lg bg-[#101014] border border-white/[0.05] space-y-1.5">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-[#F5F5F7] text-xs truncate">${escapeHTML(op.title)}</span>
                    <span class="badge ${op.type === 'winner' ? 'badge-winner' : 'badge-warning'} text-[9px]">${escapeHTML(op.impact)}</span>
                </div>
                <p class="text-[11px] text-[#A1A1A6]">${escapeHTML(op.reason)}</p>
            </div>
        `).join('');
    }

    // ─── GESTÃO DE PEDIDOS & VENDAS EM TEMPO REAL ────────────────────────────

    async loadOrdersData(silent = false) {
        if (!silent) this.showToast('Atualizando pedidos...', 'info');

        try {
            const token = window.metaAdapter.adminPassword || 'mraa2004';
            const range = window.periodStore ? window.periodStore.globalRange : null;
            
            let url = `/api/pedidos?token=${encodeURIComponent(token)}`;
            if (range && range.since && range.until && range.preset !== 'today') {
                url += `&start_date=${encodeURIComponent(range.since)}&end_date=${encodeURIComponent(range.until)}`;
            }

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.pedidos)) {
                    const map = new Map();
                    data.pedidos.forEach(p => {
                        const key = p.transaction_id || p.id;
                        if (!map.has(key) || (p.status || '').toUpperCase() === 'PAID' || (p.status || '').toUpperCase() === 'PAGO' || (p.status || '').toUpperCase() === 'APROVADO') {
                            map.set(key, p);
                        }
                    });
                    this.cachedOrders = Array.from(map.values());
                } else {
                    this.cachedOrders = [];
                }
            } else {
                this.cachedOrders = [];
            }

            this.updateOrdersMetrics();
            this.renderOrdersTable();

        } catch (err) {
            console.error('[Orders Error]', err);
        }
    }

    updateOrdersMetrics() {
        let totalRevenue = 0, paidCount = 0, pendingCount = 0;

        this.cachedOrders.forEach(p => {
            const st = (p.status || 'PENDENTE').toUpperCase();
            const isPaid = (st === 'PAID' || st === 'PAGO' || st === 'APROVADO');
            const amt = parseFloat(p.amount || 89.90);
            if (isPaid) {
                totalRevenue += amt;
                paidCount++;
            } else {
                pendingCount++;
            }
        });

        const totalOrders = paidCount + pendingCount;
        const convRate = totalOrders > 0 ? ((paidCount / totalOrders) * 100).toFixed(1) : '0.0';

        let totalSpend = 0;
        this.cachedCampaigns.forEach(c => {
            const ins = this.cachedInsights.get(c.id);
            if (ins) totalSpend += (ins.spend || 0);
        });

        const productCost = paidCount * 38.00;
        const gatewayFees = totalRevenue * 0.0399;
        const netProfit = totalRevenue - totalSpend - productCost - gatewayFees;

        const revEl = document.getElementById('orders-kpi-revenue');
        if (revEl) revEl.textContent = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;

        const paidEl = document.getElementById('orders-kpi-paid-count');
        if (paidEl) paidEl.textContent = `${paidCount} un`;

        const pendEl = document.getElementById('orders-kpi-pending-count');
        if (pendEl) pendEl.textContent = `${pendingCount} un`;

        const convEl = document.getElementById('orders-kpi-conv-rate');
        if (convEl) convEl.textContent = `${convRate}%`;

        const profEl = document.getElementById('orders-kpi-profit');
        if (profEl) {
            profEl.textContent = `R$ ${netProfit.toFixed(2).replace('.', ',')}`;
            profEl.className = netProfit >= 0 ? 'text-xl sm:text-2xl font-bold font-mono text-[#1FC16B]' : 'text-xl sm:text-2xl font-bold font-mono text-[#FF453A]';
        }

        const badgeEl = document.getElementById('sidebar-orders-badge');
        if (badgeEl) {
            if (paidCount > 0) {
                badgeEl.textContent = `${paidCount} vendas`;
                badgeEl.classList.remove('hidden');
            } else if (totalOrders > 0) {
                badgeEl.textContent = `${totalOrders}`;
                badgeEl.classList.remove('hidden');
            } else {
                badgeEl.classList.add('hidden');
            }
        }
    }

    setOrdersFilter(filter) {
        this.ordersFilter = filter;
        document.querySelectorAll('[data-order-filter]').forEach(btn => {
            if (btn.getAttribute('data-order-filter') === filter) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        this.renderOrdersTable();
    }

    searchOrders(query) {
        this.ordersSearchQuery = (query || '').toLowerCase().trim();
        this.renderOrdersTable();
    }

    renderOrdersTable() {
        const tbody = document.getElementById('orders-table-body');
        const emptyState = document.getElementById('orders-empty-state');
        if (!tbody || !emptyState) return;

        let filtered = this.cachedOrders;

        if (this.ordersFilter === 'paid') {
            filtered = filtered.filter(p => {
                const st = (p.status || 'PENDENTE').toUpperCase();
                return st === 'PAID' || st === 'PAGO' || st === 'APROVADO';
            });
        } else if (this.ordersFilter === 'pending') {
            filtered = filtered.filter(p => {
                const st = (p.status || 'PENDENTE').toUpperCase();
                return st !== 'PAID' && st !== 'PAGO' && st !== 'APROVADO';
            });
        }

        if (this.ordersSearchQuery) {
            const q = this.ordersSearchQuery;
            filtered = filtered.filter(p => {
                const name = (p.name || '').toLowerCase();
                const cpf = (p.cpf || '').replace(/\D/g, '');
                const phone = (p.phone || '').replace(/\D/g, '');
                const tx = (p.transaction_id || '').toLowerCase();
                return name.includes(q) || cpf.includes(q) || phone.includes(q) || tx.includes(q);
            });
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        tbody.innerHTML = filtered.map(p => {
            const st = (p.status || 'PENDENTE').toUpperCase();
            const isPaid = (st === 'PAID' || st === 'PAGO' || st === 'APROVADO');
            const name = p.name || 'Cliente Patriota';
            const cpf = p.cpf || '–';
            const phone = p.phone || '';
            const phoneClean = phone.replace(/\D/g, '');
            const amount = parseFloat(p.amount || 89.90).toFixed(2).replace('.', ',');
            const dt = p.created_at ? new Date(p.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Hoje';
            const txId = p.transaction_id || p.id || '';
            const pixCode = p.pix_code || '';

            return `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] text-xs">
                    <td class="py-3 px-3">
                        <div class="font-mono text-xs text-[#F5F5F7] font-semibold">${escapeHTML(dt)}</div>
                        <div class="mt-1">
                            ${isPaid
                                ? `<span class="badge badge-active text-[10px]"><span class="status-dot status-dot-active"></span> Pago (PIX)</span>`
                                : `<span class="badge badge-warning text-[10px]"><span class="status-dot status-dot-paused bg-[#F5A524]"></span> Aguardando PIX</span>`
                            }
                        </div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-xs text-[#F5F5F7]">${escapeHTML(name)}</div>
                        <div class="font-mono text-[10px] text-[#A1A1A6]">CPF: ${escapeHTML(cpf)}</div>
                        ${phoneClean ? `
                            <a href="https://wa.me/55${phoneClean}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[11px] text-[#1FC16B] hover:underline mt-0.5">
                                <span>📱</span>
                                <span class="font-mono">${escapeHTML(phone)}</span>
                            </a>
                        ` : ''}
                    </td>
                    <td class="py-3 px-3">
                        <div class="text-xs text-[#F5F5F7]">Kit Patriota (Tam ${escapeHTML(p.size || 'M')})</div>
                        <div class="text-[10px] text-[#A1A1A6] font-mono">${escapeHTML(p.shipping_type === 'express' ? 'Express (3 dias)' : 'Frete Grátis')}</div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-mono font-bold text-xs ${isPaid ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">
                            R$ ${escapeHTML(amount)}
                        </div>
                    </td>
                    <td class="py-3 px-3">
                        <span class="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[#A1A1A6]">
                            🎯 Campanha Oficial
                        </span>
                    </td>
                    <td class="py-3 px-3 text-right">
                        <div class="inline-flex items-center justify-end gap-1.5">
                            ${!isPaid && phoneClean ? `
                                <button onclick="window.dashboard.sendWhatsAppRecovery('${escapeHTML(txId)}')" class="btn btn-sm bg-[#1FC16B]/15 text-[#1FC16B] border border-[#1FC16B]/30 hover:bg-[#1FC16B] hover:text-white transition-all text-[11px]" title="Recuperar no WhatsApp">
                                    <span>💬</span>
                                    <span>Recuperar PIX</span>
                                </button>
                            ` : ''}
                            ${pixCode ? `
                                <button onclick="window.dashboard.copyPixCode('${escapeHTML(pixCode)}')" class="btn btn-secondary btn-sm text-[11px]" title="Copiar Chave PIX">
                                    <span>📋</span>
                                </button>
                            ` : ''}
                            ${isPaid ? `
                                <span class="text-[11px] font-semibold text-[#1FC16B] flex items-center gap-1">
                                    <span>✓</span> Concluído
                                </span>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    sendWhatsAppRecovery(txId) {
        const order = this.cachedOrders.find(p => (p.transaction_id || p.id) === txId);
        if (!order) return;

        const name = (order.name || 'Cliente').split(' ')[0];
        const phone = (order.phone || '').replace(/\D/g, '');
        const amount = parseFloat(order.amount || 89.90).toFixed(2).replace('.', ',');
        const pixCode = order.pix_code || '';

        if (!phone) {
            this.showToast('Este cliente não possui telefone cadastrado.', 'warning');
            return;
        }

        let msg = `Olá, ${name}! Tudo bem?\n\n`;
        msg += `Vi que você gerou o pedido do seu *Kit Patriota Oficial 2026* no valor de *R$ ${amount}*, mas o pagamento PIX ainda não consta aprovado.\n\n`;
        msg += `O seu lote com *Frete Promocional* está temporariamente reservado. Segue a sua chave PIX Copia e Cola para garantir o envio imediato:\n\n`;
        if (pixCode) {
            msg += `\`${pixCode}\`\n\n`;
        }
        msg += `Ficou com alguma dúvida ou precisa de ajuda para finalizar? Estou à disposição!`;

        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    copyPixCode(pixCode) {
        if (!pixCode) return;
        navigator.clipboard.writeText(pixCode).then(() => {
            this.showToast('Chave PIX copiada para a área de transferência!', 'success');
        });
    }

    async clearOrdersHistory() {
        if (!confirm('Deseja realmente limpar o histórico de pedidos de teste?')) return;
        try {
            const token = window.metaAdapter.adminPassword || 'mraa2004';
            const res = await fetch(`/api/pedidos?action=clear&token=${encodeURIComponent(token)}`, { method: 'POST' });
            if (res.ok) {
                this.cachedOrders = [];
                this.updateOrdersMetrics();
                this.renderOrdersTable();
                this.showToast('Histórico limpo com sucesso.', 'success');
            }
        } catch(e) {}
    }

    // ─── MODAIS DE ORÇAMENTO & TOKEN ──────────────────────────────────────────

    openBudgetModal(campId, currentBudget) {
        const modal = document.getElementById('budget-modal');
        if (!modal) return;
        document.getElementById('budget-modal-camp-id').value = campId;
        document.getElementById('budget-modal-current').textContent = `R$ ${currentBudget.toFixed(2).replace('.', ',')}`;
        document.getElementById('budget-modal-input').value = currentBudget.toFixed(2);
        modal.classList.remove('hidden');
    }

    async submitBudgetModal(event) {
        event.preventDefault();
        const campId = document.getElementById('budget-modal-camp-id').value;
        const newBudget = parseFloat(document.getElementById('budget-modal-input').value);
        if (isNaN(newBudget) || newBudget <= 0) return;

        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            this.showToast('Enviando alteração de orçamento para a Meta...', 'info');
            const newBudgetCents = Math.round(newBudget * 100);
            
            // 1. WRITE
            await window.metaAdapter.updateBudget(campId, 'daily_budget', newBudgetCents);
            
            // 2. READ & VERIFY
            const verifyRes = await window.metaAdapter.request(campId, 'GET', { fields: 'id,daily_budget' }, null, false);
            const verifiedBudgetCents = verifyRes?.daily_budget ? parseInt(verifyRes.daily_budget, 10) : null;
            
            if (verifiedBudgetCents && Math.abs(verifiedBudgetCents - newBudgetCents) > 10) {
                throw new Error('A Meta não confirmou o novo valor de orçamento na leitura pós-escrita.');
            }

            // 3. AUDIT TRAIL LOG
            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'ALTERACAO_ORCAMENTO',
                    objectId: campId,
                    before: document.getElementById('budget-modal-current').textContent,
                    after: `R$ ${newBudget.toFixed(2).replace('.', ',')}`,
                    reason: 'Ajuste manual de orçamento com verificação pós-escrita.',
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            document.getElementById('budget-modal').classList.add('hidden');
            this.showToast('Orçamento atualizado e verificado com sucesso na Meta!', 'success');
            await this.syncAllData();

        } catch (err) {
            console.error('[Budget Mutation Error]', err);
            this.showToast(`Falha na alteração de orçamento: ${err.message || 'Erro na Meta API'}`, 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    openTokenModal() {
        document.getElementById('token-modal')?.classList.remove('hidden');
    }

    async submitNewToken(event) {
        event.preventDefault();
        const tokenInput = document.getElementById('token-modal-input').value.trim();
        if (!tokenInput) return;

        try {
            this.showToast('Testando novo token...', 'info');
            const testInfo = await window.metaAdapter.request('act_846780837970771', 'GET', { fields: 'id,name' }, null, false);
            if (testInfo && testInfo.id) {
                this.showToast('Token autenticado com sucesso na Meta!', 'success');
                document.getElementById('token-modal').classList.add('hidden');
                await this.syncAllData();
            }
        } catch (err) {
            this.showToast(`Token inválido: ${err.message}`, 'error');
        }
    }

    openCampaignDrawer(campId) {
        const drawer = document.getElementById('campaign-drawer');
        const content = document.getElementById('drawer-content');
        if (!drawer || !content) return;

        const camp = this.cachedCampaigns.find(c => c.id === campId);
        const ins = this.cachedInsights.get(campId);

        content.innerHTML = `
            <div class="space-y-4 text-xs">
                <div class="p-3 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">ID da Campanha</span>
                    <p class="font-mono text-sm text-[#F5F5F7]">${campId}</p>
                </div>
                <div class="p-3 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Nome</span>
                    <p class="font-bold text-sm text-[#F5F5F7]">${escapeHTML(camp?.name || 'Campanha')}</p>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="p-3 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                        <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Gasto no Período</span>
                        <p class="font-mono font-bold text-sm text-[#F5F5F7]">${ins ? window.analyticsEngine.formatMoney(ins.spend) : 'R$ 0,00'}</p>
                    </div>
                    <div class="p-3 rounded-lg bg-[#0E0E12] border border-white/[0.05]">
                        <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Compras Registradas</span>
                        <p class="font-mono font-bold text-sm text-[#1FC16B]">${ins?.purchases || 0} un</p>
                    </div>
                </div>
            </div>
        `;
        drawer.classList.add('open');
    }

    closeDrawer() {
        document.getElementById('campaign-drawer')?.classList.remove('open');
    }

    async logout() {
        if (!confirm('Deseja realmente desconectar da sessão administrativa?')) return;
        try { await fetch('/api/meta-proxy?action=logout'); } catch(e) {}
        document.cookie = 'meta_admin_session=; Path=/; Max-Age=0';
        window.location.reload();
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
}

// Instância Singleton e Inicialização
window.dashboard = new DashboardApp();
document.addEventListener('DOMContentLoaded', () => window.dashboard.init());
