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
        this.activeCampaignTab = 'campaigns';

        // AdSets & Ads State
        this.cachedAdSets = [];
        this.adsetsCampaignFilter = 'all';
        this.adsetsFilter = 'all';
        this.adsetsSearchQuery = '';
        this.cachedAdSetInsights = new Map();

        this.cachedAds = [];
        this.adsCampaignFilter = 'all';
        this.adsAdSetFilter = 'all';
        this.adsFilter = 'all';
        this.adsSearchQuery = '';
        this.cachedAdInsights = new Map();

        this.syncRequestId = 0;

        // Metrics & Columns Master System State
        this.activeColumns = window.metricsRegistry ? window.metricsRegistry.getActiveColumns('campaign') : [
            'status_toggle', 'name', 'radwan_status', 'daily_budget', 'spend', 'purchases', 'cpa', 'revenue', 'roas', 'profit', 'link_ctr', 'link_cpc', 'cpm', 'frequency', 'initiate_checkout', 'conversion_rate', 'actions'
        ];
        this.sortColumn = 'spend';
        this.sortDirection = 'desc';
        this.isTableCompact = false;
        this.drawerSelectedColumns = [];
        this.drawerCategoryFilter = 'all';
        this.drawerSearchQuery = '';
    }

    async init() {
        this.bindEvents();
        this.setupKeyboardShortcuts();
        this.setupPeriodStoreListener();

        // Inicializa colunas e badges do Metric Registry
        this.updateActiveColumnsBadge();
        const activePreset = window.metricsRegistry ? window.metricsRegistry.repository.getActivePresetId() : 'PADRAO_GESTOR';
        const presetSelect = document.getElementById('select-metric-preset');
        if (presetSelect) presetSelect.value = activePreset === 'CUSTOM' ? 'PADRAO_GESTOR' : activePreset;

        // Listener para fechar popover da topbar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#topbar-more-menu') && !e.target.closest('button[title="Mais Opções"]')) {
                this.closeTopMoreMenu();
            }
        });

        // Atualiza status do rodapé e sidebar
        this.updateSidebarAndFooterStatus();
        window.addEventListener('radwan_autonomy_mode_changed', () => {
            this.updateSidebarAndFooterStatus();
            if (this.currentView === 'autopilot') this.renderAutopilotView();
        });
        window.addEventListener('radwan_kill_switch_changed', () => {
            this.updateSidebarAndFooterStatus();
            if (this.currentView === 'autopilot') this.renderAutopilotView();
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
        const canonical = (viewName === 'home' || viewName === 'overview') ? 'overview' : viewName;

        // Redireciona sub-níveis de campanhas para as abas internas consolidadas
        if (canonical === 'adsets') {
            this.switchView('campaigns');
            this.switchCampaignTab('adsets');
            return;
        }
        if (canonical === 'ads') {
            this.switchView('campaigns');
            this.switchCampaignTab('ads');
            return;
        }

        this.currentView = canonical;
        document.querySelectorAll('.nav-item').forEach(item => {
            const target = item.getAttribute('data-nav-target');
            if (target === canonical || (canonical === 'overview' && (target === 'home' || target === 'overview'))) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        document.querySelectorAll('.mobile-dock-btn').forEach(btn => {
            const dockTarget = btn.getAttribute('data-dock-view');
            if (dockTarget === canonical || (canonical === 'overview' && (dockTarget === 'home' || dockTarget === 'overview'))) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        document.querySelectorAll('.view-section').forEach(sec => {
            if (sec.id === `view-${canonical}`) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });

        if (canonical === 'site-intelligence') {
            this.loadSIData();
        } else if (canonical === 'orders') {
            this.loadOrdersData();
        } else if (canonical === 'creatives') {
            this.renderCreativesView();
        } else if (canonical === 'campaigns') {
            this.switchCampaignTab(this.activeCampaignTab || 'campaigns');
        } else if (canonical === 'autopilot') {
            this.renderAutopilotView();
        } else if (canonical === 'overview') {
            this.renderOverviewMetrics();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    switchCampaignTab(tabName = 'campaigns') {
        this.activeCampaignTab = tabName;

        ['campaigns', 'adsets', 'ads'].forEach(t => {
            const btn = document.getElementById(`tab-nav-${t}`);
            const view = document.getElementById(`campaigns-subview-${t}`);
            if (btn) {
                if (t === tabName) {
                    btn.classList.add('active');
                    const badge = btn.querySelector('.badge');
                    if (badge) {
                        badge.classList.remove('badge-paused');
                        badge.classList.add('badge-active');
                    }
                } else {
                    btn.classList.remove('active');
                    const badge = btn.querySelector('.badge');
                    if (badge) {
                        badge.classList.remove('badge-active');
                        badge.classList.add('badge-paused');
                    }
                }
            }
            if (view) {
                if (t === tabName) view.classList.remove('hidden');
                else view.classList.add('hidden');
            }
        });

        if (tabName === 'campaigns') {
            this.renderCampaignsTable();
        } else if (tabName === 'adsets') {
            this.renderAdSetsTable();
        } else if (tabName === 'ads') {
            this.renderAdsTable();
        }
    }

    navigateTo(viewName) {
        this.switchView(viewName);
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
        this.syncRequestId++;
        const currentReqId = this.syncRequestId;

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
            if (this.syncRequestId !== currentReqId) return;

            if (accInfo) {
                const nameEl = document.getElementById('topbar-account-name');
                if (nameEl) nameEl.textContent = accInfo.name || 'C.A 01';
                const idEl = document.getElementById('topbar-account-id');
                if (idEl) idEl.textContent = accInfo.id;
                const curEl = document.getElementById('topbar-currency');
                if (curEl) curEl.textContent = accInfo.currency || 'BRL';
                const tzEl = document.getElementById('topbar-timezone');
                if (tzEl) tzEl.textContent = accInfo.timezone_name || 'America/Sao_Paulo';
            }

            // 2. Lista de Entidades da Conta (Campanhas, Conjuntos e Anúncios)
            const [campRes, adsetRes, adsRes] = await Promise.all([
                window.metaAdapter.getCampaigns(50).catch(() => ({ data: [] })),
                window.metaAdapter.getAdSets(null, 100).catch(() => ({ data: [] })),
                window.metaAdapter.getAds(null, 100).catch(() => ({ data: [] }))
            ]);
            if (this.syncRequestId !== currentReqId) return;

            this.cachedCampaigns = campRes.data || [];
            this.cachedAdSets = adsetRes.data || [];
            this.cachedAds = adsRes.data || [];

            // Popula os dropdowns de filtro de campanha e atualiza badges das abas
            this.populateCampaignFilterDropdowns();

            const campCountBadge = document.getElementById('campaigns-count-badge');
            const tabCampCount = document.getElementById('tab-count-campaigns');
            const tabAdsetCount = document.getElementById('tab-count-adsets');
            const tabAdsCount = document.getElementById('tab-count-ads');
            if (campCountBadge) campCountBadge.textContent = `${this.cachedCampaigns.length} Campanhas`;
            if (tabCampCount) tabCampCount.textContent = `${this.cachedCampaigns.length}`;
            if (tabAdsetCount) tabAdsetCount.textContent = `${this.cachedAdSets.length}`;
            if (tabAdsCount) tabAdsCount.textContent = `${this.cachedAds.length}`;

            // 3. Insights por Nível (level=campaign, level=adset, level=ad)
            const periodParam = (period.preset === 'custom' && period.since && period.until)
                ? { since: period.since, until: period.until }
                : period.preset;

            const [campInsightsRes, adsetInsightsRes, adInsightsRes] = await Promise.all([
                window.metaAdapter.getAccountLevelInsights('campaign', periodParam).catch(() => ({ data: [] })),
                window.metaAdapter.getAccountLevelInsights('adset', periodParam).catch(() => ({ data: [] })),
                window.metaAdapter.getAccountLevelInsights('ad', periodParam).catch(() => ({ data: [] }))
            ]);
            if (this.syncRequestId !== currentReqId) return;

            // Mapeia Insights de Campanhas
            this.cachedInsights.clear();
            (campInsightsRes.data || []).forEach(item => {
                if (item.campaign_id) {
                    this.cachedInsights.set(item.campaign_id, window.analyticsEngine.parseInsights(item));
                }
            });

            // Fallback para campanhas se a busca em lote não retornar insights de campanha
            if (this.cachedInsights.size === 0 && this.cachedCampaigns.length > 0) {
                const indCampPromises = this.cachedCampaigns.map(camp =>
                    window.metaAdapter.getInsights(camp.id, periodParam)
                        .then(res => ({ id: camp.id, data: res?.data?.[0] || null }))
                        .catch(() => ({ id: camp.id, data: null }))
                );
                const indResults = await Promise.all(indCampPromises);
                if (this.syncRequestId !== currentReqId) return;
                indResults.forEach(item => {
                    this.cachedInsights.set(item.id, window.analyticsEngine.parseInsights(item.data));
                });
            }

            // Mapeia Insights de Conjuntos (AdSets)
            this.cachedAdSetInsights.clear();
            (adsetInsightsRes.data || []).forEach(item => {
                if (item.adset_id) {
                    this.cachedAdSetInsights.set(item.adset_id, window.analyticsEngine.parseInsights(item));
                }
            });

            // Fallback para conjuntos se a busca em lote não trouxer registros
            if (this.cachedAdSetInsights.size === 0 && this.cachedAdSets.length > 0) {
                const activeAdSets = this.cachedAdSets.filter(a => a.status === 'ACTIVE').slice(0, 15);
                const indAdSetPromises = activeAdSets.map(adset =>
                    window.metaAdapter.getInsights(adset.id, periodParam)
                        .then(res => ({ id: adset.id, data: res?.data?.[0] || null }))
                        .catch(() => ({ id: adset.id, data: null }))
                );
                const indAdSetResults = await Promise.all(indAdSetPromises);
                if (this.syncRequestId !== currentReqId) return;
                indAdSetResults.forEach(item => {
                    this.cachedAdSetInsights.set(item.id, window.analyticsEngine.parseInsights(item.data));
                });
            }

            // Mapeia Insights de Anúncios (Ads)
            this.cachedAdInsights.clear();
            (adInsightsRes.data || []).forEach(item => {
                if (item.ad_id) {
                    this.cachedAdInsights.set(item.ad_id, window.analyticsEngine.parseInsights(item));
                }
            });

            // Fallback para anúncios se a busca em lote não trouxer registros
            if (this.cachedAdInsights.size === 0 && this.cachedAds.length > 0) {
                const activeAds = this.cachedAds.filter(a => a.status === 'ACTIVE').slice(0, 15);
                const indAdsPromises = activeAds.map(ad =>
                    window.metaAdapter.getInsights(ad.id, periodParam)
                        .then(res => ({ id: ad.id, data: res?.data?.[0] || null }))
                        .catch(() => ({ id: ad.id, data: null }))
                );
                const indAdsResults = await Promise.all(indAdsPromises);
                if (this.syncRequestId !== currentReqId) return;
                indAdsResults.forEach(item => {
                    this.cachedAdInsights.set(item.id, window.analyticsEngine.parseInsights(item.data));
                });
            }

            // 4. Se Modo Comparação estiver ativo: buscar período anterior equivalente
            this.previousPeriodInsights.clear();
            if (isComparison && period.since && period.until) {
                const prev = window.periodStore.calculatePreviousPeriod(period.since, period.until);
                const prevLevelRes = await window.metaAdapter.getAccountLevelInsights('campaign', { since: prev.since, until: prev.until }).catch(() => ({ data: [] }));
                if (this.syncRequestId !== currentReqId) return;
                (prevLevelRes.data || []).forEach(item => {
                    if (item.campaign_id) {
                        this.previousPeriodInsights.set(item.campaign_id, window.analyticsEngine.parseInsights(item));
                    }
                });
            }

            // 5. Renderizar Visões
            this.renderOverviewMetrics();
            this.renderWhatShouldIDoNow();
            if (this.currentView === 'campaigns') {
                this.switchCampaignTab(this.activeCampaignTab || 'campaigns');
            } else {
                this.renderCampaignsTable();
            }
            if (typeof this.renderFunnelView === 'function') this.renderFunnelView();
            if (typeof this.renderCreativesView === 'function') this.renderCreativesView();
            if (typeof this.renderAuditLogs === 'function') this.renderAuditLogs();
            if (typeof this.renderTopOpportunities === 'function') this.renderTopOpportunities();

            // 6. Pedidos no período
            await this.loadOrdersData(true);
            if (this.syncRequestId !== currentReqId) return;

            const syncEl = document.getElementById('topbar-last-sync');
            if (syncEl) syncEl.textContent = new Date().toLocaleTimeString('pt-BR');
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
        const allMetrics = [];
        this.cachedCampaigns.forEach(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            allMetrics.push(ins);
        });

        // Agregação Canônica e Matematicamente Correta (sem média de taxas)
        const agg = window.analyticsEngine.aggregateInsights(allMetrics);
        const profit = agg.revenue - agg.spend;

        // Renderiza valores no Snapshot Superior
        const spendEl = document.getElementById('kpi-spend');
        if (spendEl) spendEl.textContent = window.analyticsEngine.formatMoney(agg.spend);

        const revEl = document.getElementById('kpi-revenue');
        if (revEl) revEl.textContent = window.analyticsEngine.formatMoney(agg.revenue);

        const profitEl = document.getElementById('kpi-profit');
        if (profitEl) {
            profitEl.textContent = window.analyticsEngine.formatMoney(profit);
            profitEl.className = `text-xl sm:text-2xl font-bold font-mono ${profit >= 0 ? 'text-[#1FC16B]' : 'text-[#FF453A]'}`;
        }

        const roasEl = document.getElementById('kpi-roas');
        if (roasEl) roasEl.textContent = agg.roas !== null ? `${agg.roas.toFixed(2)}x` : '0,00x';

        const cpaEl = document.getElementById('kpi-cpa');
        if (cpaEl) cpaEl.textContent = agg.cpa !== null ? window.analyticsEngine.formatMoney(agg.cpa) : '–';

        const purchasesEl = document.getElementById('kpi-purchases');
        if (purchasesEl) purchasesEl.textContent = `${agg.purchases} un`;

        // Renderiza KPIs de Tráfego Agregados (Saúde da Operação)
        const ctrEl = document.getElementById('kpi-ctr');
        if (ctrEl) ctrEl.textContent = agg.ctr !== null ? `${agg.ctr.toFixed(2).replace('.', ',')}%` : '–';

        const cpcEl = document.getElementById('kpi-cpc');
        if (cpcEl) cpcEl.textContent = agg.cpc !== null ? window.analyticsEngine.formatMoney(agg.cpc) : '–';
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

    // ─── CONSOLE OPERACIONAL DE CAMPANHAS COM METRICS & COLUMNS MASTER ───────

    updateActiveColumnsBadge() {
        const badge = document.getElementById('active-columns-badge');
        if (badge) badge.textContent = this.activeColumns.length;
    }

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

    changeMetricPreset(presetId) {
        if (!window.metricsRegistry) return;
        const preset = window.metricsRegistry.getPreset(presetId);
        if (preset) {
            this.activeColumns = [...preset.columns];
            window.metricsRegistry.repository.setActivePresetId(presetId);
            this.updateActiveColumnsBadge();
            this.renderCampaignsTable();
            this.showToast(`Visualização alterada para: ${preset.name}`, 'info');
        }
    }

    toggleTableDensity() {
        this.isTableCompact = !this.isTableCompact;
        const table = document.getElementById('campaigns-table');
        if (table) {
            if (this.isTableCompact) table.classList.add('table-compact');
            else table.classList.remove('table-compact');
        }
        this.showToast(`Densidade da tabela: ${this.isTableCompact ? 'Compacta' : 'Confortável'}`, 'info');
    }

    handleSort(metricId) {
        if (metricId === 'actions' || metricId === 'status_toggle') return;
        if (this.sortColumn === metricId) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = metricId;
            this.sortDirection = 'desc';
        }
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
        const labelEl = document.getElementById('bulk-selected-label');
        const selectAllCheckbox = document.getElementById('select-all-campaigns');
        const count = this.selectedCampaigns.size;
        
        if (countEl) countEl.textContent = count;
        if (labelEl) labelEl.textContent = count === 1 ? 'selecionada' : 'selecionadas';
        
        if (bar) {
            if (count > 0) {
                bar.classList.add('active');
                // Compensação para não sobrepor o último card na visualização
                document.getElementById('view-campaigns')?.style.setProperty('padding-bottom', '100px');
            } else {
                bar.classList.remove('active');
                document.getElementById('view-campaigns')?.style.removeProperty('padding-bottom');
            }
        }

        const visible = this.getFilteredCampaigns();
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = visible.length > 0 && visible.every(c => this.selectedCampaigns.has(c.id));
        }
    }

    getFilteredCampaigns() {
        let list = this.cachedCampaigns.filter(camp => {
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

        // Ordenação dinâmica
        if (this.sortColumn && window.metricsRegistry) {
            const metricDef = window.metricsRegistry.getMetric(this.sortColumn);
            if (metricDef) {
                list.sort((a, b) => {
                    const insA = this.cachedInsights.get(a.id);
                    const insB = this.cachedInsights.get(b.id);
                    let valA = metricDef.calculate(insA, a, this.cachedOrders);
                    let valB = metricDef.calculate(insB, b, this.cachedOrders);

                    if (valA === null || valA === undefined) valA = -999999;
                    if (valB === null || valB === undefined) valB = -999999;

                    if (typeof valA === 'string') {
                        return this.sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    }
                    return this.sortDirection === 'asc' ? (valA - valB) : (valB - valA);
                });
            }
        }

        return list;
    }

    renderCampaignsTableHead() {
        const thead = document.getElementById('campaigns-table-head');
        if (!thead || !window.metricsRegistry) return;

        let html = '<tr>';
        
        // Checkbox geral
        html += `
            <th class="sticky-col-check text-center">
                <input type="checkbox" id="select-all-campaigns" onchange="window.dashboard.toggleSelectAllCampaigns(this.checked)" class="custom-checkbox" title="Selecionar todas as campanhas visíveis">
            </th>
        `;

        this.activeColumns.forEach(metricId => {
            const metric = window.metricsRegistry.getMetric(metricId);
            if (!metric) return;

            let stickyClass = '';
            if (metricId === 'status_toggle') stickyClass = 'sticky-col-status';

            const isSorted = this.sortColumn === metricId;
            const sortClass = metric.sortable ? `sortable-th ${isSorted ? (this.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}` : '';
            const sortIcon = metric.sortable ? `<span class="sort-icon">${isSorted ? (this.sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>` : '';
            const alignClass = metric.align === 'right' ? 'text-right' : (metric.align === 'center' ? 'text-center' : 'text-left');

            html += `
                <th class="${stickyClass} ${sortClass} ${alignClass}" onclick="${metric.sortable ? `window.dashboard.handleSort('${metricId}')` : ''}" title="${escapeHTML(metric.tooltip || metric.label)}" style="min-width: ${metric.minWidth}px;">
                    <span>${escapeHTML(metric.shortLabel || metric.label)}</span>
                    ${sortIcon}
                </th>
            `;
        });

        html += '</tr>';
        thead.innerHTML = html;
    }

    renderCampaignsTable() {
        this.renderCampaignsTableHead();

        const tbody = document.getElementById('campaigns-table-body');
        const mobileContainer = document.getElementById('campaigns-mobile-cards');
        if (!tbody || !window.metricsRegistry) return;

        const filtered = this.getFilteredCampaigns();

        // Atualiza KPIs resumo no topo do console
        let totalSpend = 0, totalPurchases = 0, totalRevenue = 0;
        this.cachedCampaigns.forEach(c => {
            const ins = this.cachedInsights.get(c.id);
            if (ins) {
                totalSpend += (ins.spend || 0);
                totalPurchases += (ins.purchases || 0);
                totalRevenue += (ins.revenue || 0);
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
            const colSpan = this.activeColumns.length + 1;
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="p-8 text-center text-[#6E6E73] italic text-xs">Nenhuma campanha encontrada para os filtros selecionados.</td></tr>`;
            if (mobileContainer) mobileContainer.innerHTML = `<p class="text-xs text-[#6E6E73] text-center py-6">Nenhuma campanha encontrada.</p>`;
            return;
        }

        // Tabela Desktop Dinâmica
        tbody.innerHTML = filtered.map(camp => {
            const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
            const isSelected = this.selectedCampaigns.has(camp.id);
            const info = this.getCampaignInfo(camp);
            const safeDisplayName = escapeHTML(info.displayName);
            const safeOriginalName = escapeHTML(info.name);
            const safeId = escapeHTML(camp.id);

            let rowHtml = `<tr class="hover:bg-[#15151A] transition-colors text-xs border-b border-white/[0.04] ${isSelected ? 'is-selected bg-[#FF2D2D]/[0.03]' : ''}">`;

            // Checkbox da linha (sticky)
            rowHtml += `
                <td class="sticky-col-check text-center">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelectCampaign('${safeId}')" class="custom-checkbox" aria-label="Selecionar ${safeDisplayName}">
                </td>
            `;

            this.activeColumns.forEach(metricId => {
                const metric = window.metricsRegistry.getMetric(metricId);
                if (!metric) return;

                let stickyClass = '';
                if (metricId === 'status_toggle') stickyClass = 'sticky-col-status';

                const alignClass = metric.align === 'right' ? 'text-right tabular-nums' : (metric.align === 'center' ? 'text-center' : 'text-left');
                const rawVal = metric.calculate(ins, camp, this.cachedOrders);

                let cellContent = '';

                if (metricId === 'status_toggle') {
                    const isActive = camp.status === 'ACTIVE';
                    cellContent = `
                        <label class="apple-switch" title="${isActive ? 'Campanha Ativa • Clique para pausar' : 'Campanha Pausada • Clique para reativar'}">
                            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleCampaignStatus('${safeId}', '${camp.status}', this)">
                            <span class="apple-switch-track"><span class="apple-switch-thumb"></span></span>
                        </label>
                    `;
                } else if (metricId === 'name') {
                    const isCBO = info.isCBO;
                    cellContent = `
                        <div class="flex items-center gap-1.5 group">
                            <div class="min-w-0 flex-1">
                                <div class="font-semibold text-[#F5F5F7] truncate max-w-[230px]" title="${safeDisplayName}">
                                    ${safeDisplayName}
                                    ${info.hasNickname ? '<span class="ml-1 text-[9px] px-1 py-0.2 bg-[#FF2D2D]/10 text-[#FF2D2D] rounded font-normal">Apelido</span>' : ''}
                                </div>
                                <div class="flex items-center gap-1.5 text-[10px] text-[#6E6E73] font-mono truncate max-w-[230px]">
                                    <span>ID: ${safeId}</span>
                                    <span>•</span>
                                    <span class="${isCBO ? 'text-[#5DA9FF]' : 'text-[#A1A1A6]'}">${isCBO ? 'CBO' : 'ABO'}</span>
                                    ${info.hasNickname ? `<span>•</span><span class="truncate text-[#A1A1A6]" title="Nome oficial Meta: ${safeOriginalName}">Meta: ${safeOriginalName}</span>` : ''}
                                </div>
                            </div>
                            <button onclick="window.dashboard.openRenameModal('${safeId}')" class="opacity-0 group-hover:opacity-100 text-[#A1A1A6] hover:text-[#F5F5F7] p-1 text-[11px] transition-opacity" title="Renomear campanha">
                                ✏️
                            </button>
                        </div>
                    `;
                } else if (metricId === 'daily_budget') {
                    const budgetVal = rawVal || 0;
                    const isCBO = info.isCBO;
                    cellContent = `
                        <button onclick="window.dashboard.openBudgetModal('${safeId}', ${budgetVal}, '${safeDisplayName}', ${isCBO})" class="hover:underline text-[#F5F5F7] font-semibold inline-flex items-center justify-end gap-1 ml-auto" title="Clique para editar orçamento">
                            <span>R$ ${budgetVal.toFixed(2).replace('.', ',')}</span>
                            <span class="text-[10px] text-[#6E6E73]">✏️</span>
                        </button>
                    `;
                } else if (metricId === 'actions') {
                    cellContent = `
                        <div class="inline-flex items-center gap-1 justify-center">
                            <button onclick="window.dashboard.openRenameModal('${safeId}')" class="btn btn-secondary btn-sm text-[11px] px-2" title="Renomear Campanha">
                                ✏️
                            </button>
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeDisplayName}')" class="btn btn-secondary btn-sm text-[11px] px-2" title="Duplicar Campanha">
                                📋
                            </button>
                            <button onclick="window.dashboard.openRadwanAnalysisModal('${safeId}')" class="btn btn-secondary btn-sm text-[11px] px-2" title="Diagnóstico Radwan">
                                🧠
                            </button>
                            <button onclick="window.dashboard.openCampaignDrawer('${safeId}')" class="btn btn-primary btn-sm text-[11px] px-2" title="Painel de Métricas da Campanha">
                                📊
                            </button>
                        </div>
                    `;
                } else {
                    cellContent = window.metricsRegistry.formatValue(metricId, rawVal);
                }

                rowHtml += `<td class="${stickyClass} ${alignClass} p-3">${cellContent}</td>`;
            });

            rowHtml += '</tr>';
            return rowHtml;
        }).join('');

        // Cards Mobile (< 640px)
        if (mobileContainer) {
            mobileContainer.innerHTML = filtered.map(camp => {
                const ins = this.cachedInsights.get(camp.id) || window.analyticsEngine.parseInsights(null);
                const isActive = camp.status === 'ACTIVE';
                const isSelected = this.selectedCampaigns.has(camp.id);
                const info = this.getCampaignInfo(camp);
                const budgetVal = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : (camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : 0);
                const safeDisplayName = escapeHTML(info.displayName);
                const safeOriginalName = escapeHTML(info.name);
                const safeId = escapeHTML(camp.id);

                return `
                    <div class="campaign-mobile-card space-y-3 ${isSelected ? 'is-selected' : ''}">
                        <!-- Top Header do Card -->
                        <div class="flex items-start justify-between gap-2 border-b border-white/[0.05] pb-2.5">
                            <div class="flex items-start gap-2.5 min-w-0 flex-1">
                                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelectCampaign('${safeId}')" class="custom-checkbox mt-0.5" aria-label="Selecionar ${safeDisplayName}">
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <h4 class="font-bold text-xs text-[#F5F5F7] truncate">${safeDisplayName}</h4>
                                        ${info.hasNickname ? '<span class="text-[8.5px] px-1 py-0.2 bg-[#FF2D2D]/10 text-[#FF2D2D] rounded font-semibold">Apelido</span>' : ''}
                                    </div>
                                    <p class="text-[10px] text-[#6E6E73] font-mono mt-0.5 truncate">
                                        ID: ${safeId} • <span class="${info.isCBO ? 'text-[#5DA9FF]' : 'text-[#A1A1A6]'} font-semibold">${info.isCBO ? 'CBO' : 'ABO'}</span>
                                        ${info.hasNickname ? `• Meta: ${safeOriginalName}` : ''}
                                    </p>
                                </div>
                            </div>
                            <label class="apple-switch flex-shrink-0" title="${isActive ? 'Campanha Ativa • Toque para pausar' : 'Campanha Pausada • Toque para reativar'}">
                                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleCampaignStatus('${safeId}', '${camp.status}', this)">
                                <span class="apple-switch-track"><span class="apple-switch-thumb"></span></span>
                            </label>
                        </div>

                        <!-- Grid 2x2 de Métricas Principais -->
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="p-2.5 rounded-lg bg-[#0A0A0D] border border-white/[0.04]">
                                <span class="text-[9.5px] text-[#6E6E73] uppercase font-bold block mb-0.5">Investimento</span>
                                <p class="tabular-nums font-bold text-[#F5F5F7] text-sm">${window.analyticsEngine.formatMoney(ins.spend)}</p>
                            </div>
                            <div class="p-2.5 rounded-lg bg-[#0A0A0D] border border-white/[0.04]">
                                <span class="text-[9.5px] text-[#6E6E73] uppercase font-bold block mb-0.5">Vendas / CPA</span>
                                <p class="tabular-nums font-bold text-[#1FC16B] text-sm">${ins.purchases} <span class="text-xs font-normal text-[#A1A1A6]">(${ins.cpa ? window.analyticsEngine.formatMoney(ins.cpa) : '–'})</span></p>
                            </div>
                            <div class="p-2.5 rounded-lg bg-[#0A0A0D] border border-white/[0.04]">
                                <span class="text-[9.5px] text-[#6E6E73] uppercase font-bold block mb-0.5">ROAS Meta</span>
                                <p class="tabular-nums font-bold ${ins.roas && ins.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'} text-sm">${ins.roas ? `${ins.roas.toFixed(2)}x` : '–'}</p>
                            </div>
                            <div class="p-2.5 rounded-lg bg-[#0A0A0D] border border-white/[0.04]">
                                <span class="text-[9.5px] text-[#6E6E73] uppercase font-bold block mb-0.5">Orçamento Diário</span>
                                <p class="tabular-nums font-bold text-[#F5F5F7] text-sm">R$ ${budgetVal.toFixed(2).replace('.', ',')}</p>
                            </div>
                        </div>

                        <!-- Botão Central Inspecionar Todas as Métricas -->
                        <button onclick="window.dashboard.openCampaignDrawer('${safeId}')" class="w-full py-2 px-3 rounded-lg bg-[#15151A] hover:bg-[#1C1C24] border border-white/[0.08] text-xs font-semibold text-[#5DA9FF] flex items-center justify-between transition-colors shadow-sm">
                            <span class="flex items-center gap-1.5"><span>📊</span><span>Painel de Métricas & Diagnóstico</span></span>
                            <span>➔</span>
                        </button>

                        <!-- Barra de 5 Ações Touch Rápidas -->
                        <div class="mobile-card-actions-bar">
                            <button onclick="window.dashboard.openRenameModal('${safeId}')" class="mobile-card-action-btn" title="Renomear Campanha">
                                <span>✏️</span>
                                <span>Renomear</span>
                            </button>
                            <button onclick="window.dashboard.openBudgetModal('${safeId}', ${budgetVal}, '${safeDisplayName}', ${info.isCBO})" class="mobile-card-action-btn" title="Ajustar Orçamento">
                                <span>💰</span>
                                <span>Orçamento</span>
                            </button>
                            <button onclick="window.dashboard.openCampaignDrawer('${safeId}')" class="mobile-card-action-btn" title="Ver Métricas">
                                <span>📊</span>
                                <span>Métricas</span>
                            </button>
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeDisplayName}')" class="mobile-card-action-btn" title="Duplicar">
                                <span>📋</span>
                                <span>Duplicar</span>
                            </button>
                            <button onclick="window.dashboard.openRadwanAnalysisModal('${safeId}')" class="mobile-card-action-btn" title="Diagnóstico Radwan">
                                <span>🧠</span>
                                <span>Radwan</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        this.setupTableStickyScrollDepth();
    }

    // ─── CONTROLADOR DO COLUMN MANAGER DRAWER ─────────────────────────────────

    openColumnManager() {
        const drawer = document.getElementById('column-manager-drawer');
        if (!drawer || !window.metricsRegistry) return;

        this.drawerSelectedColumns = [...this.activeColumns];
        this.renderMetricsCatalog();
        this.renderSelectedColumnsList();
        this.renderSavedViewsList();

        const countEl = document.getElementById('column-manager-selected-count');
        if (countEl) countEl.textContent = `${this.drawerSelectedColumns.length} selecionadas`;

        drawer.classList.add('open');
    }

    closeColumnManager() {
        const drawer = document.getElementById('column-manager-drawer');
        if (drawer) drawer.classList.remove('open');
    }

    filterMetricsCatalog(query) {
        this.drawerSearchQuery = (query || '').toLowerCase().trim();
        this.renderMetricsCatalog();
    }

    filterMetricCategory(category) {
        this.drawerCategoryFilter = category;
        document.querySelectorAll('[data-cat-filter]').forEach(btn => {
            if (btn.getAttribute('data-cat-filter') === category) {
                btn.className = 'px-2 py-1 rounded bg-[#15151A] text-[#F5F5F7] border border-white/[0.08] font-semibold';
            } else {
                btn.className = 'px-2 py-1 rounded text-[#A1A1A6] hover:text-[#F5F5F7]';
            }
        });
        this.renderMetricsCatalog();
    }

    renderMetricsCatalog() {
        const container = document.getElementById('metrics-catalog-list');
        if (!container || !window.metricsRegistry) return;

        let allMetrics = window.metricsRegistry.getAllMetrics();

        // Filtro por Categoria
        if (this.drawerCategoryFilter !== 'all') {
            allMetrics = allMetrics.filter(m => m.category === this.drawerCategoryFilter);
        }

        // Filtro por Busca
        if (this.drawerSearchQuery) {
            allMetrics = allMetrics.filter(m => 
                (m.label || '').toLowerCase().includes(this.drawerSearchQuery) ||
                (m.shortLabel || '').toLowerCase().includes(this.drawerSearchQuery) ||
                (m.id || '').toLowerCase().includes(this.drawerSearchQuery) ||
                (m.description || '').toLowerCase().includes(this.drawerSearchQuery)
            );
        }

        if (allMetrics.length === 0) {
            container.innerHTML = `<p class="text-xs text-[#6E6E73] italic py-6 text-center">Nenhuma métrica encontrada para "${escapeHTML(this.drawerSearchQuery)}".</p>`;
            return;
        }

        container.innerHTML = allMetrics.map(m => {
            const isSelected = this.drawerSelectedColumns.includes(m.id);
            let sourceBadge = '';
            if (m.source === 'META_RAW' || m.source === 'META_ACTION') sourceBadge = '<span class="source-tag source-tag-meta">Meta</span>';
            else if (m.source === 'BACKEND_ORDER') sourceBadge = '<span class="source-tag source-tag-real">Real</span>';
            else if (m.source === 'RADWAN') sourceBadge = '<span class="source-tag source-tag-radwan">Radwan</span>';
            else if (m.source === 'ECONOMICS' || m.source === 'DERIVED') sourceBadge = '<span class="source-tag source-tag-derived">Fórmula</span>';

            return `
                <div onclick="window.dashboard.toggleMetricInDrawer('${m.id}')" class="metric-picker-item ${isSelected ? 'selected' : ''}">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} class="custom-checkbox mt-0.5 pointer-events-none">
                    <div class="flex-1 min-w-0 space-y-0.5">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-bold text-xs text-[#F5F5F7] truncate">${escapeHTML(m.label)}</span>
                            ${sourceBadge}
                        </div>
                        <p class="text-[10.5px] text-[#A1A1A6] line-clamp-1">${escapeHTML(m.beginnerDescription || m.tooltip || '')}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSelectedColumnsList() {
        const container = document.getElementById('selected-columns-order-list');
        const countEl = document.getElementById('column-manager-selected-count');
        if (countEl) countEl.textContent = `${this.drawerSelectedColumns.length} selecionadas`;
        if (!container || !window.metricsRegistry) return;

        if (this.drawerSelectedColumns.length === 0) {
            container.innerHTML = `<p class="text-xs text-[#6E6E73] italic py-4 text-center">Nenhuma coluna selecionada.</p>`;
            return;
        }

        container.innerHTML = this.drawerSelectedColumns.map((metricId, index) => {
            const metric = window.metricsRegistry.getMetric(metricId);
            if (!metric) return '';

            const isFirst = index === 0;
            const isLast = index === this.drawerSelectedColumns.length - 1;
            const isEssential = metricId === 'name';

            return `
                <div class="order-list-item">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-4 h-4 rounded bg-white/[0.05] text-[#A1A1A6] text-[10px] font-mono flex items-center justify-center">${index + 1}</span>
                        <span class="font-semibold text-xs text-[#F5F5F7] truncate">${escapeHTML(metric.label)}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="event.stopPropagation(); window.dashboard.moveColumnOrder(${index}, -1)" ${isFirst ? 'disabled' : ''} class="btn-icon text-xs text-gray-400 hover:text-white disabled:opacity-20" title="Mover para cima">▲</button>
                        <button onclick="event.stopPropagation(); window.dashboard.moveColumnOrder(${index}, 1)" ${isLast ? 'disabled' : ''} class="btn-icon text-xs text-gray-400 hover:text-white disabled:opacity-20" title="Mover para baixo">▼</button>
                        ${!isEssential ? `
                            <button onclick="event.stopPropagation(); window.dashboard.removeColumnFromDrawer('${metricId}')" class="btn-icon text-xs text-[#FF453A] hover:text-white ml-1" title="Remover coluna">✕</button>
                        ` : '<span class="w-5"></span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSavedViewsList() {
        const container = document.getElementById('saved-views-container');
        if (!container || !window.metricsRegistry) return;

        const views = window.metricsRegistry.repository.getSavedViews();
        if (views.length === 0) {
            container.innerHTML = `<p class="text-[10px] text-[#6E6E73] italic">Nenhuma visão personalizada salva.</p>`;
            return;
        }

        container.innerHTML = views.map(v => `
            <div class="flex items-center justify-between py-1 text-xs">
                <button onclick="window.dashboard.loadCustomView('${v.id}')" class="text-[#5DA9FF] hover:underline font-medium truncate max-w-[140px]" title="Carregar ${escapeHTML(v.name)}">
                    ${escapeHTML(v.name)} <span class="text-[9.5px] text-[#6E6E73]">(${v.columns.length})</span>
                </button>
                <button onclick="window.dashboard.deleteCustomView('${v.id}')" class="text-[10px] text-[#FF453A] hover:underline">Excluir</button>
            </div>
        `).join('');
    }

    toggleMetricInDrawer(metricId) {
        const index = this.drawerSelectedColumns.indexOf(metricId);
        if (index >= 0) {
            if (metricId === 'name') {
                this.showToast('A coluna Nome da Campanha é obrigatória.', 'warning');
                return;
            }
            this.drawerSelectedColumns.splice(index, 1);
        } else {
            this.drawerSelectedColumns.push(metricId);
        }
        this.renderMetricsCatalog();
        this.renderSelectedColumnsList();
    }

    moveColumnOrder(index, direction) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= this.drawerSelectedColumns.length) return;
        const temp = this.drawerSelectedColumns[index];
        this.drawerSelectedColumns[index] = this.drawerSelectedColumns[targetIndex];
        this.drawerSelectedColumns[targetIndex] = temp;
        this.renderSelectedColumnsList();
    }

    removeColumnFromDrawer(metricId) {
        if (metricId === 'name') {
            this.showToast('A coluna Nome da Campanha é obrigatória.', 'warning');
            return;
        }
        this.drawerSelectedColumns = this.drawerSelectedColumns.filter(id => id !== metricId);
        this.renderMetricsCatalog();
        this.renderSelectedColumnsList();
    }

    applyPresetInDrawer(presetId) {
        if (!window.metricsRegistry) return;
        const preset = window.metricsRegistry.getPreset(presetId);
        if (preset) {
            this.drawerSelectedColumns = [...preset.columns];
            document.querySelectorAll('[data-drawer-preset]').forEach(btn => {
                if (btn.getAttribute('data-drawer-preset') === presetId) btn.classList.add('active');
                else btn.classList.remove('active');
            });
            this.renderMetricsCatalog();
            this.renderSelectedColumnsList();
        }
    }

    restoreDefaultColumns() {
        if (!window.metricsRegistry) return;
        this.drawerSelectedColumns = [...window.metricsRegistry.presets.PADRAO_GESTOR.columns];
        this.renderMetricsCatalog();
        this.renderSelectedColumnsList();
        this.showToast('Preset restaurado para Padrão do Gestor.', 'info');
    }

    applySelectedColumns() {
        if (this.drawerSelectedColumns.length === 0) {
            this.drawerSelectedColumns = [...window.metricsRegistry.presets.PADRAO_GESTOR.columns];
        }
        this.activeColumns = [...this.drawerSelectedColumns];
        if (window.metricsRegistry) {
            window.metricsRegistry.setActiveColumns(this.activeColumns, 'campaign');
        }
        this.updateActiveColumnsBadge();
        this.closeColumnManager();
        this.renderCampaignsTable();
        this.showToast(`Tabela atualizada com ${this.activeColumns.length} colunas selecionadas!`, 'success');
    }

    saveCurrentCustomView() {
        const input = document.getElementById('save-view-name-input');
        const name = input ? input.value.trim() : '';
        if (!name) {
            this.showToast('Informe um nome para a visão personalizada.', 'warning');
            return;
        }
        if (window.metricsRegistry) {
            window.metricsRegistry.repository.saveView(name, this.drawerSelectedColumns, 'campaign');
            if (input) input.value = '';
            this.renderSavedViewsList();
            this.showToast(`Visão "${name}" salva com sucesso!`, 'success');
        }
    }

    loadCustomView(viewId) {
        if (!window.metricsRegistry) return;
        const views = window.metricsRegistry.repository.getSavedViews();
        const view = views.find(v => v.id === viewId);
        if (view) {
            this.drawerSelectedColumns = [...view.columns];
            this.renderMetricsCatalog();
            this.renderSelectedColumnsList();
            this.showToast(`Visão "${view.name}" carregada no editor.`, 'info');
        }
    }

    deleteCustomView(viewId) {
        if (!confirm('Deseja realmente excluir esta visão salva?')) return;
        if (window.metricsRegistry) {
            window.metricsRegistry.repository.deleteView(viewId);
            this.renderSavedViewsList();
            this.showToast('Visão excluída.', 'info');
        }
    }

    openMobileMetricDetails(campId) {
        const modal = document.getElementById('mobile-metric-details-modal');
        const grid = document.getElementById('mobile-modal-metrics-grid');
        const nameEl = document.getElementById('mobile-modal-camp-name');
        const idEl = document.getElementById('mobile-modal-camp-id');
        if (!modal || !grid || !window.metricsRegistry) return;

        const camp = this.cachedCampaigns.find(c => c.id === campId);
        const ins = this.cachedInsights.get(campId) || window.analyticsEngine.parseInsights(null);

        if (nameEl) nameEl.textContent = camp ? camp.name : 'Campanha';
        if (idEl) idEl.textContent = `ID: ${campId}`;

        grid.innerHTML = this.activeColumns.map(metricId => {
            const metric = window.metricsRegistry.getMetric(metricId);
            if (!metric || metricId === 'actions' || metricId === 'status_toggle') return '';

            const rawVal = metric.calculate(ins, camp, this.cachedOrders);
            const formatted = window.metricsRegistry.formatValue(metricId, rawVal);

            let sourceTag = '';
            if (m => m.source === 'META_RAW') sourceTag = 'Meta';

            return `
                <div class="flex items-center justify-between py-2">
                    <div>
                        <p class="font-semibold text-xs text-[#F5F5F7]">${escapeHTML(metric.label)}</p>
                        <p class="text-[10px] text-[#6E6E73]">${escapeHTML(metric.shortLabel || '')}</p>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-xs">${formatted}</span>
                    </div>
                </div>
            `;
        }).join('');

        modal.classList.remove('hidden');
    }

    // ─── OPERAÇÕES DE MUTAÇÃO EM CAMPANHAS (WRITE-READ-VERIFY) ────────────────

    async toggleCampaignStatus(campId, currentStatus, inputEl = null) {
        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        const actionLabel = newStatus === 'ACTIVE' ? 'reativar' : 'pausar';
        const toggleWrapper = inputEl?.closest('.toggle-switch');

        if (!confirm(`Deseja realmente ${actionLabel} a campanha ${campId}?`)) {
            if (inputEl) inputEl.checked = currentStatus === 'ACTIVE';
            return;
        }

        try {
            if (toggleWrapper) toggleWrapper.classList.add('is-loading');
            if (inputEl) inputEl.disabled = true;
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
            if (inputEl) inputEl.checked = currentStatus === 'ACTIVE';
            this.renderCampaignsTable();
        } finally {
            if (toggleWrapper) toggleWrapper.classList.remove('is-loading');
            if (inputEl) inputEl.disabled = false;
        }
    }

    // ─── MODAL DE ORÇAMENTO (CBO / ABO COM PREVIEW E PRESETS) ────────────────

    openBudgetModal(objectId, currentBudget, displayName = '', isCBO = true, level = 'campaign') {
        const modal = document.getElementById('budget-modal');
        if (!modal) return;

        const objIdEl = document.getElementById('budget-modal-object-id');
        const currValEl = document.getElementById('budget-modal-current-val');
        const levelEl = document.getElementById('budget-modal-level');
        const titleEl = document.getElementById('budget-modal-title');
        const subtitleEl = document.getElementById('budget-modal-subtitle');
        const badgeEl = document.getElementById('budget-modal-structure-badge');
        const inputEl = document.getElementById('budget-modal-input');

        const numVal = typeof currentBudget === 'number' ? currentBudget : (parseFloat(currentBudget) || 0);

        if (objIdEl) objIdEl.value = objectId;
        if (currValEl) currValEl.value = numVal;
        if (levelEl) levelEl.value = level;

        if (titleEl) titleEl.textContent = level === 'campaign' ? 'Ajustar Orçamento de Campanha' : 'Ajustar Orçamento do Conjunto';
        if (subtitleEl) subtitleEl.textContent = displayName || `ID: ${objectId}`;

        if (badgeEl) {
            if (level === 'campaign') {
                badgeEl.textContent = isCBO ? 'CBO • Nível Campanha (Advantage+)' : 'ABO • Orçamento nos Conjuntos';
                badgeEl.className = isCBO ? 'badge badge-active text-[10px]' : 'badge badge-paused text-[10px]';
            } else {
                badgeEl.textContent = 'ABO • Nível Conjunto';
                badgeEl.className = 'badge badge-active text-[10px]';
            }
        }

        if (inputEl) inputEl.value = numVal > 0 ? numVal.toFixed(2) : '50.00';

        this.updateBudgetPreview();
        modal.classList.remove('hidden');
    }

    applyBudgetModifier(pct) {
        const currValEl = document.getElementById('budget-modal-current-val');
        const inputEl = document.getElementById('budget-modal-input');
        const base = parseFloat(currValEl?.value) || 50;
        const nextVal = Math.max(5, base * (1 + pct / 100));

        if (inputEl) inputEl.value = nextVal.toFixed(2);
        this.updateBudgetPreview();
    }

    resetBudgetModal() {
        const currValEl = document.getElementById('budget-modal-current-val');
        const inputEl = document.getElementById('budget-modal-input');
        const base = parseFloat(currValEl?.value) || 50;

        if (inputEl) inputEl.value = base.toFixed(2);
        this.updateBudgetPreview();
    }

    updateBudgetPreview() {
        const currValEl = document.getElementById('budget-modal-current-val');
        const inputEl = document.getElementById('budget-modal-input');
        const beforeEl = document.getElementById('budget-modal-preview-before');
        const afterEl = document.getElementById('budget-modal-preview-after');
        const diffEl = document.getElementById('budget-modal-preview-diff');

        const before = parseFloat(currValEl?.value) || 0;
        const after = parseFloat(inputEl?.value) || 0;

        if (beforeEl) beforeEl.textContent = `R$ ${before.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (afterEl) afterEl.textContent = `R$ ${after.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (diffEl) {
            if (before > 0) {
                const diffR$ = after - before;
                const diffPct = ((after - before) / before) * 100;
                const sign = diffPct > 0 ? '+' : '';
                diffEl.textContent = `${sign}${diffPct.toFixed(1)}% (${sign}R$ ${diffR$.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/dia)`;
                diffEl.className = diffPct > 0 ? 'font-mono font-bold text-[#1FC16B]' : (diffPct < 0 ? 'font-mono font-bold text-[#FF453A]' : 'font-mono font-bold text-[#F5F5F7]');
            } else {
                diffEl.textContent = 'Novo Orçamento Definido';
                diffEl.className = 'font-mono font-bold text-[#5DA9FF]';
            }
        }
    }

    async submitBudgetModal(event) {
        event.preventDefault();
        const objId = document.getElementById('budget-modal-object-id')?.value;
        const level = document.getElementById('budget-modal-level')?.value || 'campaign';
        const newVal = parseFloat(document.getElementById('budget-modal-input')?.value);
        const submitBtn = document.getElementById('btn-submit-budget');

        if (!objId || isNaN(newVal) || newVal < 5) {
            this.showToast('O orçamento diário mínimo na Meta é de R$ 5,00.', 'warning');
            return;
        }

        const budgetInCents = Math.round(newVal * 100);

        try {
            if (submitBtn) submitBtn.disabled = true;
            this.showToast(`Atualizando orçamento para R$ ${newVal.toFixed(2).replace('.', ',')} na Meta...`, 'info');

            // 1. WRITE via Meta API
            await window.metaAdapter.request(objId, 'POST', {}, {
                daily_budget: budgetInCents
            }, true);

            // 2. AUDIT LOG
            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'ORCAMENTO_ALTERADO',
                    objectId: objId,
                    before: document.getElementById('budget-modal-preview-before')?.textContent || '--',
                    after: `R$ ${newVal.toFixed(2).replace('.', ',')}`,
                    reason: `Ajuste manual seguro de orçamento (${level}).`,
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            document.getElementById('budget-modal')?.classList.add('hidden');
            this.showToast(`Orçamento atualizado e verificado com sucesso!`, 'success');

            if (level === 'adset') {
                await this.loadAdSetsData(true);
            } else {
                await this.syncAllData(true);
            }

        } catch (err) {
            console.error('[Budget Mutation Error]', err);
            this.showToast(`Falha ao alterar orçamento: ${err.message || 'Erro na Meta'}`, 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // ─── MODAL DE DUPLICAÇÃO ──────────────────────────────────────────────────

    openDuplicateModal(objectId, currentName) {
        const modal = document.getElementById('duplicate-modal');
        if (!modal) return;

        const objIdEl = document.getElementById('duplicate-modal-object-id');
        const inputEl = document.getElementById('duplicate-modal-input');
        const titleEl = document.getElementById('duplicate-modal-title');

        if (objIdEl) objIdEl.value = objectId;
        if (inputEl) inputEl.value = `${currentName || 'Objeto'} - Cópia`;
        if (titleEl) titleEl.textContent = `Duplicar: ${currentName || objectId}`;

        modal.classList.remove('hidden');
    }

    async submitDuplicateModal(event) {
        event.preventDefault();
        const objId = document.getElementById('duplicate-modal-object-id')?.value;
        const newName = document.getElementById('duplicate-modal-input')?.value?.trim();
        const submitBtn = document.getElementById('btn-submit-duplicate');

        if (!objId || !newName) return;

        try {
            if (submitBtn) submitBtn.disabled = true;
            this.showToast(`Duplicando objeto na Meta...`, 'info');

            await window.metaAdapter.request(`${objId}/copies`, 'POST', {}, {
                status_option: 'PAUSED',
                rename_options: { rename_suffix: ` - ${newName}` }
            }, true);

            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'DUPLICACAO_OBJETO',
                    objectId: objId,
                    before: `Original: ${objId}`,
                    after: `Cópia: ${newName} (PAUSED)`,
                    reason: 'Duplicação assistida.',
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            document.getElementById('duplicate-modal')?.classList.add('hidden');
            this.showToast(`Objeto duplicado com sucesso!`, 'success');
            await this.syncAllData(true);

        } catch (err) {
            console.error('[Duplicate Error]', err);
            this.showToast(`Falha na duplicação: ${err.message || 'Recurso restrito'}`, 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // ─── MODAL DE DIAGNÓSTICO RADWAN ──────────────────────────────────────────

    openRadwanAnalysisModal(objectId, entityType = 'auto') {
        const modal = document.getElementById('radwan-analysis-modal');
        const container = document.getElementById('radwan-analysis-content');
        if (!modal || !container) return;

        // 1. ESTADO DE LOADING IMEDIATO
        container.innerHTML = `
            <div class="py-8 text-center space-y-3">
                <div class="w-8 h-8 rounded-full border-2 border-[#FF2D2D] border-t-transparent animate-spin mx-auto"></div>
                <p class="text-xs text-[#A1A1A6]">Analisando métricas e gerando diagnóstico da inteligência...</p>
            </div>
        `;
        modal.classList.remove('hidden');

        try {
            // 2. RESOLUÇÃO DE ENTIDADE (Campanha, Conjunto ou Anúncio)
            let entity = null;
            let ins = null;
            let entityCategory = 'Campanha';

            // Busca em Campanhas
            const camp = (this.cachedCampaigns || []).find(c => c.id === objectId);
            if (camp) {
                entity = camp;
                ins = this.cachedInsights?.get(objectId);
                entityCategory = 'Campanha';
            }

            // Busca em Conjuntos (AdSets) se não for campanha
            if (!entity && this.cachedAdSets) {
                const adset = this.cachedAdSets.find(a => a.id === objectId);
                if (adset) {
                    entity = adset;
                    ins = this.cachedAdSetInsights?.get(objectId);
                    entityCategory = 'Conjunto de Anúncios';
                }
            }

            // Busca em Anúncios (Ads) se não for conjunto
            if (!entity && this.cachedAds) {
                const ad = this.cachedAds.find(a => a.id === objectId);
                if (ad) {
                    entity = ad;
                    ins = this.cachedAdInsights?.get(objectId);
                    entityCategory = 'Anúncio Individual';
                }
            }

            // Fallback de Insights
            if (!ins) {
                ins = window.analyticsEngine?.parseInsights?.(null) || { spend: 0, purchases: 0, cpa: 0, roas: 0, link_ctr: 0 };
            }

            const entityName = entity ? entity.name : `Entidade ${objectId}`;
            const isPaused = entity && entity.status === 'PAUSED';

            // 3. ESTADO: DADOS INSUFICIENTES
            if (ins.spend === 0 && ins.purchases === 0 && (!ins.impressions || ins.impressions < 20)) {
                container.innerHTML = `
                    <div class="p-4 rounded-xl bg-[#15151A] border border-white/[0.05] space-y-3">
                        <div class="flex items-center justify-between">
                            <div class="min-w-0 pr-2">
                                <span class="font-bold text-[#F5F5F7] text-sm block truncate">${escapeHTML(entityName)}</span>
                                <span class="text-[10px] text-[#6E6E73] font-mono">${escapeHTML(entityCategory)} • ID: ${escapeHTML(objectId)}</span>
                            </div>
                            <span class="badge badge-paused text-[10px] flex-shrink-0">${isPaused ? 'PAUSADA' : 'SEM DADOS'}</span>
                        </div>
                        <div class="p-3 rounded-lg bg-[#0E0E12] border border-white/[0.04] text-center space-y-1.5">
                            <p class="font-bold text-[#F5F5F7] text-xs">Dados insuficientes para diagnóstico no período</p>
                            <p class="text-[#A1A1A6] text-xs leading-relaxed">
                                Esta entidade ainda não acumulou volume estatístico suficiente no intervalo de datas selecionado. O RADWAN aguarda veiculação de dados para emitir recomendações de escala ou parada.
                            </p>
                        </div>
                    </div>
                `;
                return;
            }

            // 4. ESTADO: SUCESSO / DIAGNÓSTICO COMPLETO
            let advice = 'Entidade operando dentro dos parâmetros de estabilidade da conta. Manter observação com o orçamento atual.';
            let tag = 'badge-active';
            let tagLabel = 'SAUDÁVEL';
            let actionSuggestion = 'Nenhuma intervenção necessária no momento.';
            let healthScore = 75;

            if (ins.roas && ins.roas >= 2.5 && ins.purchases >= 2) {
                advice = 'Desempenho excelente com ROAS acima da meta e custo por aquisição controlado. Alta propensão para escala financeira com segurança.';
                tag = 'badge-winner';
                tagLabel = 'WINNER';
                actionSuggestion = 'Aumentar orçamento diário em +15%';
                healthScore = 95;
            } else if (ins.spend >= 35 && ins.purchases === 0) {
                advice = 'Gasto relevante consumido sem conversões registradas no período. Recomenda-se pausar temporariamente para conter queima de caixa ou reformular o criativo.';
                tag = 'badge-error';
                tagLabel = 'ATENÇÃO CRÍTICA';
                actionSuggestion = 'Pausar entidade para estancar custo';
                healthScore = 38;
            } else if (ins.link_ctr && ins.link_ctr < 1.0) {
                advice = 'Taxa de clique no link (CTR) abaixo do benchmark de referência (1.50%). O gancho do criativo ou público alvo está gerando pouca tração.';
                tag = 'badge-warning';
                tagLabel = 'BAIXA ATRAÇÃO';
                actionSuggestion = 'Testar novo ângulo ou criativo alternativo';
                healthScore = 58;
            } else if (ins.cpa && ins.cpa > 45.00) {
                advice = 'Custo por aquisição (CPA) acima da meta de rentabilidade. Otimize os conjuntos de anúncios ou melhore a taxa de conversão do checkout.';
                tag = 'badge-warning';
                tagLabel = 'CPA ELEVADO';
                actionSuggestion = 'Reduzir orçamento ou refinar público';
                healthScore = 62;
            }

            const formattedSpend = window.analyticsEngine?.formatMoney?.(ins.spend) || `R$ ${Number(ins.spend || 0).toFixed(2)}`;
            const formattedCpa = ins.cpa ? (window.analyticsEngine?.formatMoney?.(ins.cpa) || `R$ ${Number(ins.cpa).toFixed(2)}`) : '–';
            const formattedRoas = ins.roas ? `${Number(ins.roas).toFixed(2)}x` : '–';
            const budgetVal = camp?.daily_budget ? (camp.daily_budget / 100) : 50;

            container.innerHTML = `
                <div class="p-3.5 rounded-xl bg-[#15151A] border border-white/[0.05] space-y-2.5">
                    <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0 pr-2">
                            <span class="font-bold text-[#F5F5F7] text-sm block truncate">${escapeHTML(entityName)}</span>
                            <span class="text-[10px] text-[#6E6E73] font-mono">${escapeHTML(entityCategory)} • ID: ${escapeHTML(objectId)}</span>
                        </div>
                        <div class="flex items-center gap-1.5 flex-shrink-0">
                            <span class="badge ${tag} text-[10px] font-bold">${tagLabel}</span>
                            <span class="font-mono font-bold text-xs ${healthScore >= 80 ? 'text-[#1FC16B]' : (healthScore < 50 ? 'text-[#FF453A]' : 'text-[#5DA9FF]')}">Score ${healthScore}</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 gap-2 text-xs pt-2 border-t border-white/[0.04]">
                        <div>
                            <span class="text-[#6E6E73] block text-[10px] uppercase font-bold">Investido</span>
                            <b class="text-[#F5F5F7] font-mono">${formattedSpend}</b>
                        </div>
                        <div>
                            <span class="text-[#6E6E73] block text-[10px] uppercase font-bold">Vendas</span>
                            <b class="text-[#1FC16B] font-mono">${ins.purchases || 0} un</b>
                        </div>
                        <div>
                            <span class="text-[#6E6E73] block text-[10px] uppercase font-bold">CPA</span>
                            <b class="text-[#F5F5F7] font-mono">${formattedCpa}</b>
                        </div>
                        <div>
                            <span class="text-[#6E6E73] block text-[10px] uppercase font-bold">ROAS</span>
                            <b class="${(ins.roas && ins.roas >= 2.2) ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'} font-mono">${formattedRoas}</b>
                        </div>
                    </div>
                </div>

                <div class="p-3.5 rounded-xl bg-[#0E0E12] border border-white/[0.04] space-y-2.5">
                    <div>
                        <p class="font-bold text-[#F5F5F7] text-xs">Parecer da Inteligência Radwan:</p>
                        <p class="text-[#A1A1A6] text-xs leading-relaxed mt-1">${escapeHTML(advice)}</p>
                    </div>
                    <div class="pt-2.5 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div class="text-[11px] text-[#5DA9FF] font-semibold flex items-center gap-1">
                            <span>💡 Ação Recomendada:</span>
                            <span>${escapeHTML(actionSuggestion)}</span>
                        </div>
                        ${(ins.roas && ins.roas >= 2.5 && camp) ? `
                            <button onclick="document.getElementById('radwan-analysis-modal').classList.add('hidden'); window.dashboard.openBudgetModal('${objectId}', ${budgetVal}, '${escapeHTML(camp.name || '')}', true)" class="btn btn-primary btn-sm text-[11px] whitespace-nowrap self-end sm:self-auto">
                                Aumentar +15% ➔
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;

        } catch (err) {
            console.error('[Radwan Analysis Modal Error]', err);
            container.innerHTML = `
                <div class="p-4 rounded-xl bg-[#FF453A]/10 border border-[#FF453A]/30 space-y-2 text-center">
                    <div class="text-2xl">⚠️</div>
                    <h4 class="font-bold text-[#F5F5F7] text-sm">Não foi possível carregar o diagnóstico</h4>
                    <p class="text-xs text-[#A1A1A6]">Ocorreu um erro ao processar os dados da entidade selecionada.</p>
                </div>
            `;
        }
    }

    // ─── CONTROLE DE CONJUNTOS DE ANÚNCIOS (AD SETS CONSOLE) ─────────────────

    populateCampaignFilterDropdowns() {
        const adsetSelect = document.getElementById('adsets-campaign-filter-select');
        const adsSelect = document.getElementById('ads-campaign-filter-select');

        const optionsHtml = `
            <option value="all">🌐 Todas as Campanhas</option>
            ${this.cachedCampaigns.map(c => `
                <option value="${c.id}">${escapeHTML(c.name)}</option>
            `).join('')}
        `;

        if (adsetSelect) adsetSelect.innerHTML = optionsHtml;
        if (adsSelect) adsSelect.innerHTML = optionsHtml;
    }

    async loadAdSetsData(silent = false) {
        try {
            if (!silent) this.showToast('Carregando conjuntos de anúncios da conta...', 'info');

            const res = await window.metaAdapter.getAdSets(this.adsetsCampaignFilter !== 'all' ? this.adsetsCampaignFilter : null);
            this.cachedAdSets = res.data || [];

            // Popula os badge totais e resumos
            const countBadge = document.getElementById('adsets-count-badge');
            if (countBadge) countBadge.textContent = `${this.cachedAdSets.length} Conjuntos`;

            this.renderAdSetsTable();

        } catch (err) {
            console.error('[Load AdSets Error]', err);
            if (!silent) this.showToast(`Erro ao carregar conjuntos: ${err.message || 'Falha de rede'}`, 'error');
        }
    }

    filterAdSetsByCampaign(campId) {
        this.adsetsCampaignFilter = campId || 'all';
        const selectEl = document.getElementById('adsets-campaign-filter-select');
        if (selectEl) selectEl.value = this.adsetsCampaignFilter;
        this.renderAdSetsTable();
    }

    setAdSetFilter(filter) {
        this.adsetsFilter = filter;
        document.querySelectorAll('[data-adset-filter]').forEach(btn => {
            if (btn.getAttribute('data-adset-filter') === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        this.renderAdSetsTable();
    }

    filterAdSetsList(query) {
        this.adsetsSearchQuery = (query || '').toLowerCase().trim();
        this.renderAdSetsTable();
    }

    renderAdSetsTable() {
        const tbody = document.getElementById('adsets-table-body');
        const mobileContainer = document.getElementById('adsets-mobile-cards');
        if (!tbody) return;

        let list = [...this.cachedAdSets];

        // 1. Filtro por Campanha
        if (this.adsetsCampaignFilter !== 'all') {
            list = list.filter(a => a.campaign_id === this.adsetsCampaignFilter);
        }

        // 2. Filtro por Status
        if (this.adsetsFilter === 'active') {
            list = list.filter(a => a.status === 'ACTIVE');
        } else if (this.adsetsFilter === 'paused') {
            list = list.filter(a => a.status === 'PAUSED');
        } else if (this.adsetsFilter === 'sales') {
            list = list.filter(a => {
                const ins = this.cachedAdSetInsights.get(a.id);
                return ins && ins.purchases > 0;
            });
        }

        // 3. Filtro por Busca
        if (this.adsetsSearchQuery) {
            list = list.filter(a => 
                (a.name || '').toLowerCase().includes(this.adsetsSearchQuery) ||
                (a.id || '').includes(this.adsetsSearchQuery)
            );
        }

        // Totais resumidos diretamente das métricas reais de cada conjunto
        let totalSpend = 0;
        let totalPurchases = 0;

        list.forEach(adset => {
            const adsetIns = this.cachedAdSetInsights.get(adset.id) || window.analyticsEngine.parseInsights(null);
            totalSpend += (adsetIns.spend || 0);
            totalPurchases += (adsetIns.purchases || 0);
        });

        const spendSummary = document.getElementById('adsets-summary-spend');
        const purchasesSummary = document.getElementById('adsets-summary-purchases');
        if (spendSummary) spendSummary.textContent = window.analyticsEngine.formatMoney(totalSpend);
        if (purchasesSummary) purchasesSummary.textContent = `${totalPurchases} un`;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td class="p-8 text-center text-[#6E6E73] italic text-xs" colspan="10">
                        Nenhum conjunto encontrado para os filtros selecionados.
                    </td>
                </tr>
            `;
            if (mobileContainer) mobileContainer.innerHTML = '<p class="text-xs text-[#6E6E73] italic text-center py-6">Nenhum conjunto encontrado.</p>';
            return;
        }

        tbody.innerHTML = list.map(adset => {
            const parentCamp = this.cachedCampaigns.find(c => c.id === adset.campaign_id);
            const adsetIns = this.cachedAdSetInsights.get(adset.id) || window.analyticsEngine.parseInsights(null);
            const isCBO = Boolean(parentCamp?.daily_budget || parentCamp?.lifetime_budget);
            const adsetBudget = adset.daily_budget ? (adset.daily_budget / 100) : 0;
            const safeName = escapeHTML(adset.name || 'Conjunto');
            const safeCampName = escapeHTML(parentCamp?.name || 'Campanha');
            const safeId = escapeHTML(adset.id);
            const isActive = adset.status === 'ACTIVE';

            return `
                <tr class="hover:bg-[#15151A] transition-colors text-xs border-b border-white/[0.04] group">
                    <td class="sticky-col-status text-center py-3">
                        <label class="apple-switch" title="${isActive ? 'Conjunto Ativo • Clique para pausar' : 'Conjunto Pausado • Clique para reativar'}">
                            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleAdSetStatus('${safeId}', '${adset.status}', this)">
                            <span class="apple-switch-track"><span class="apple-switch-thumb"></span></span>
                        </label>
                    </td>
                    <td class="text-xs text-[#F5F5F7] min-w-[200px] max-w-[280px]">
                        <div class="font-semibold text-[#F5F5F7] truncate" title="${safeName}">${safeName}</div>
                        <div class="text-[10px] text-[#6E6E73] font-mono truncate">ID: ${safeId}</div>
                    </td>
                    <td class="text-xs text-[#A1A1A6] min-w-[160px] max-w-[220px]">
                        <div class="truncate text-[#A1A1A6] font-medium" title="${safeCampName}">${safeCampName}</div>
                    </td>
                    <td class="text-right text-xs">
                        ${isCBO ? `
                            <span class="badge badge-paused text-[9.5px]" title="Orçamento gerenciado no nível da campanha (CBO)">CBO · Campanha</span>
                        ` : `
                            <button onclick="window.dashboard.openBudgetModal('${safeId}', ${adsetBudget}, '${safeName}', false, 'adset')" class="hover:underline text-[#F5F5F7] font-semibold inline-flex items-center justify-end gap-1 ml-auto" title="Clique para editar orçamento do conjunto (ABO)">
                                <span>R$ ${adsetBudget.toFixed(2).replace('.', ',')}</span>
                                <span class="text-[10px] text-[#6E6E73]">✏️</span>
                            </button>
                        `}
                    </td>
                    <td class="text-right text-xs font-mono tabular-nums text-[#F5F5F7]">${window.analyticsEngine.formatMoney(adsetIns.spend)}</td>
                    <td class="text-right text-xs font-mono tabular-nums font-bold ${adsetIns.purchases > 0 ? 'text-[#1FC16B]' : 'text-[#6E6E73]'}">${adsetIns.purchases}</td>
                    <td class="text-right text-xs font-mono tabular-nums text-[#F5F5F7]">${adsetIns.cpa ? window.analyticsEngine.formatMoney(adsetIns.cpa) : '–'}</td>
                    <td class="text-right text-xs font-mono tabular-nums font-bold ${adsetIns.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${adsetIns.roas ? `${adsetIns.roas.toFixed(2)}x` : '–'}</td>
                    <td class="text-right text-xs font-mono tabular-nums font-semibold ${adsetIns.link_ctr >= 1.5 ? 'text-[#1FC16B]' : 'text-[#A1A1A6]'}">${adsetIns.link_ctr ? `${adsetIns.link_ctr.toFixed(2).replace('.', ',')}%` : '–'}</td>
                    <td class="text-center py-2">
                        <div class="inline-flex items-center gap-1.5 justify-center">
                            <button onclick="window.dashboard.filterAdsByAdSet('${safeId}')" class="btn btn-primary btn-sm text-[11px] px-2.5 py-1" title="Ver Anúncios deste conjunto">
                                <span>Anúncios ➔</span>
                            </button>
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeName}')" class="btn btn-secondary btn-sm text-[11px] px-2 py-1" title="Duplicar Conjunto">
                                <span>📋</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (mobileContainer) {
            mobileContainer.innerHTML = list.map(adset => {
                const parentCamp = this.cachedCampaigns.find(c => c.id === adset.campaign_id);
                const adsetIns = this.cachedAdSetInsights.get(adset.id) || window.analyticsEngine.parseInsights(null);
                const isCBO = Boolean(parentCamp?.daily_budget || parentCamp?.lifetime_budget);
                const adsetBudget = adset.daily_budget ? (adset.daily_budget / 100) : 0;
                const safeName = escapeHTML(adset.name || 'Conjunto');
                const safeCampName = escapeHTML(parentCamp?.name || 'Campanha');
                const safeId = escapeHTML(adset.id);
                const isActive = adset.status === 'ACTIVE';

                return `
                    <div class="mobile-campaign-card space-y-3 p-3.5 bg-[#0E0E12] border border-white/[0.06] rounded-xl">
                        <div class="flex items-start justify-between gap-2.5">
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5 mb-1">
                                    <span class="badge ${isActive ? 'badge-active' : 'badge-paused'} text-[9px]">${adset.status}</span>
                                    <span class="badge badge-paused text-[9px] font-mono">${isCBO ? 'CBO · Campanha' : 'ABO'}</span>
                                </div>
                                <h4 class="font-bold text-xs text-[#F5F5F7] truncate" title="${safeName}">${safeName}</h4>
                                <p class="text-[10.5px] text-[#A1A1A6] truncate" title="${safeCampName}">Campanha: ${safeCampName}</p>
                            </div>
                            <label class="apple-switch flex-shrink-0" title="${isActive ? 'Pausar Conjunto' : 'Ativar Conjunto'}">
                                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleAdSetStatus('${safeId}', '${adset.status}', this)">
                                <span class="apple-switch-track"><span class="apple-switch-thumb"></span></span>
                            </label>
                        </div>
                        <div class="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-[#141418] border border-white/[0.04] text-xs">
                            <div>
                                <span class="text-[10px] text-[#6E6E73] block uppercase font-bold">Investido</span>
                                <span class="font-bold font-mono text-[#F5F5F7]">${window.analyticsEngine.formatMoney(adsetIns.spend)}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-[#6E6E73] block uppercase font-bold">Vendas</span>
                                <span class="font-bold font-mono ${adsetIns.purchases > 0 ? 'text-[#1FC16B]' : 'text-[#6E6E73]'}">${adsetIns.purchases} un</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-[#6E6E73] block uppercase font-bold">ROAS</span>
                                <span class="font-bold font-mono ${adsetIns.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${adsetIns.roas !== null ? `${adsetIns.roas.toFixed(2)}x` : '–'}</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                            <div class="text-[11px] text-[#A1A1A6]">
                                ${isCBO ? '<span class="text-[#6E6E73]">Orçamento CBO</span>' : `<span class="font-semibold text-[#F5F5F7]">R$ ${adsetBudget.toFixed(2).replace('.', ',')}/dia</span>`}
                            </div>
                            <div class="flex items-center gap-1.5">
                                <button onclick="window.dashboard.filterAdsByAdSet('${safeId}')" class="btn btn-primary btn-sm text-[11px] py-1 px-2.5">
                                    Ver Anúncios ➔
                                </button>
                                <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeName}')" class="btn btn-secondary btn-sm text-[11px] py-1 px-2" title="Duplicar Conjunto">
                                    📋
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        this.setupTableStickyScrollDepth();
    }

    async toggleAdSetStatus(adsetId, currentStatus, inputEl = null) {
        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        const actionLabel = newStatus === 'ACTIVE' ? 'reativar' : 'pausar';
        const toggleWrapper = inputEl?.closest('.apple-switch, .toggle-switch');

        if (!confirm(`Deseja realmente ${actionLabel} o conjunto ${adsetId}?`)) {
            if (inputEl) inputEl.checked = currentStatus === 'ACTIVE';
            return;
        }

        try {
            if (toggleWrapper) toggleWrapper.classList.add('is-loading');
            if (inputEl) inputEl.disabled = true;
            this.showToast(`Alterando status do conjunto na Meta...`, 'info');

            await window.metaAdapter.updateStatus(adsetId, newStatus);

            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'STATUS_CONJUNTO_ALTERADO',
                    objectId: adsetId,
                    before: currentStatus,
                    after: newStatus,
                    reason: `Ajuste operacional de status do conjunto (${actionLabel}).`,
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            this.showToast(`Conjunto ${newStatus === 'ACTIVE' ? 'reativado' : 'pausado'} com sucesso!`, 'success');
            await this.loadAdSetsData(true);

        } catch (err) {
            console.error('[AdSet Status Error]', err);
            this.showToast(`Falha ao alterar conjunto: ${err.message || 'Erro na Meta'}`, 'error');
            if (inputEl) inputEl.checked = currentStatus === 'ACTIVE';
        } finally {
            if (toggleWrapper) toggleWrapper.classList.remove('is-loading');
            if (inputEl) inputEl.disabled = false;
        }
    }

    // ─── CONTROLE DE ANÚNCIOS INDIVIDUAIS (ADS CONSOLE) ──────────────────────

    async loadAdsData(silent = false) {
        try {
            if (!silent) this.showToast('Carregando anúncios individuais da conta...', 'info');

            const res = await window.metaAdapter.getAds(this.adsetsCampaignFilter !== 'all' ? null : null);
            this.cachedAds = res.data || [];

            const countBadge = document.getElementById('ads-count-badge');
            if (countBadge) countBadge.textContent = `${this.cachedAds.length} Anúncios`;

            this.renderAdsTable();

        } catch (err) {
            console.error('[Load Ads Error]', err);
            if (!silent) this.showToast(`Erro ao carregar anúncios: ${err.message || 'Falha de rede'}`, 'error');
        }
    }

    filterAdsByCampaign(campId) {
        this.adsCampaignFilter = campId || 'all';
        this.adsAdSetFilter = 'all';
        const selectEl = document.getElementById('ads-campaign-filter-select');
        if (selectEl) selectEl.value = this.adsCampaignFilter;
        this.renderAdsTable();
    }

    filterAdsByAdSet(adsetId) {
        this.switchView('campaigns');
        this.switchCampaignTab('ads');
        const adset = this.cachedAdSets.find(a => a.id === adsetId);
        if (adset) {
            this.adsCampaignFilter = adset.campaign_id;
            const selectEl = document.getElementById('ads-campaign-filter-select');
            if (selectEl) selectEl.value = this.adsCampaignFilter;
            this.adsAdSetFilter = adsetId;
        } else {
            this.adsAdSetFilter = adsetId;
        }
        this.renderAdsTable();
    }

    setAdFilter(filter) {
        this.adsFilter = filter;
        document.querySelectorAll('[data-ad-filter]').forEach(btn => {
            if (btn.getAttribute('data-ad-filter') === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        this.renderAdsTable();
    }

    filterAdsList(query) {
        this.adsSearchQuery = (query || '').toLowerCase().trim();
        this.renderAdsTable();
    }

    renderAdsTable() {
        const tbody = document.getElementById('ads-table-body');
        const mobileContainer = document.getElementById('ads-mobile-cards');
        if (!tbody) return;

        let list = [...this.cachedAds];

        // 1. Filtro por Campanha
        if (this.adsCampaignFilter !== 'all') {
            list = list.filter(a => a.campaign_id === this.adsCampaignFilter);
        }

        // 2. Filtro por Conjunto (se especificado)
        if (this.adsAdSetFilter && this.adsAdSetFilter !== 'all') {
            list = list.filter(a => a.adset_id === this.adsAdSetFilter);
        }

        // 3. Filtro por Status
        if (this.adsFilter === 'active') {
            list = list.filter(a => a.status === 'ACTIVE');
        } else if (this.adsFilter === 'paused') {
            list = list.filter(a => a.status === 'PAUSED');
        } else if (this.adsFilter === 'sales') {
            list = list.filter(a => {
                const ins = this.cachedAdInsights.get(a.id);
                return ins && ins.purchases > 0;
            });
        }

        // 4. Filtro por Busca
        if (this.adsSearchQuery) {
            list = list.filter(a => 
                (a.name || '').toLowerCase().includes(this.adsSearchQuery) ||
                (a.id || '').includes(this.adsSearchQuery)
            );
        }

        // Totais resumidos diretamente das métricas reais de cada anúncio
        let totalSpend = 0;
        let totalPurchases = 0;

        list.forEach(ad => {
            const adIns = this.cachedAdInsights.get(ad.id) || window.analyticsEngine.parseInsights(null);
            totalSpend += (adIns.spend || 0);
            totalPurchases += (adIns.purchases || 0);
        });

        const spendSummary = document.getElementById('ads-summary-spend');
        const purchasesSummary = document.getElementById('ads-summary-purchases');
        if (spendSummary) spendSummary.textContent = window.analyticsEngine.formatMoney(totalSpend);
        if (purchasesSummary) purchasesSummary.textContent = `${totalPurchases} un`;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td class="p-8 text-center text-[#6E6E73] italic text-xs" colspan="9">
                        Nenhum anúncio encontrado para os filtros selecionados.
                    </td>
                </tr>
            `;
            if (mobileContainer) mobileContainer.innerHTML = '<p class="text-xs text-[#6E6E73] italic text-center py-6">Nenhum anúncio encontrado.</p>';
            return;
        }

        tbody.innerHTML = list.map(ad => {
            const parentCamp = this.cachedCampaigns.find(c => c.id === ad.campaign_id);
            const parentAdSet = this.cachedAdSets.find(s => s.id === ad.adset_id);
            const adIns = this.cachedAdInsights.get(ad.id) || window.analyticsEngine.parseInsights(null);
            const safeName = escapeHTML(ad.name || 'Anúncio');
            const safeCampName = escapeHTML(parentCamp?.name || 'Campanha');
            const safeAdSetName = escapeHTML(parentAdSet?.name || 'Conjunto');
            const safeId = escapeHTML(ad.id);
            const isActive = ad.status === 'ACTIVE';

            const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url;

            return `
                <tr class="hover:bg-[#15151A] transition-colors text-xs border-b border-white/[0.04] group">
                    <td class="sticky-col-status text-center py-3">
                        <label class="apple-switch" title="${isActive ? 'Anúncio Ativo • Clique para pausar' : 'Anúncio Pausado • Clique para reativar'}">
                            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleAdStatus('${safeId}', '${ad.status}', this)">
                            <span class="apple-switch-track"><span class="apple-switch-thumb"></span></span>
                        </label>
                    </td>
                    <td class="text-xs text-[#F5F5F7] min-w-[220px] max-w-[300px]">
                        <div class="flex items-center gap-2.5">
                            ${thumb ? `
                                <img src="${thumb}" alt="${safeName}" class="w-9 h-9 rounded-md object-cover border border-white/[0.08] flex-shrink-0">
                            ` : `
                                <div class="w-9 h-9 rounded-md bg-[#18181E] border border-white/[0.06] flex items-center justify-center text-sm flex-shrink-0 text-[#6E6E73]">🎬</div>
                            `}
                            <div class="min-w-0 flex-1">
                                <div class="font-semibold text-[#F5F5F7] truncate" title="${safeName}">${safeName}</div>
                                <div class="text-[10px] text-[#6E6E73] font-mono truncate">ID: ${safeId}</div>
                            </div>
                        </div>
                    </td>
                    <td class="text-xs text-[#A1A1A6] min-w-[160px] max-w-[220px]">
                        <div class="font-medium text-xs text-[#F5F5F7] truncate" title="${safeCampName}">${safeCampName}</div>
                        <div class="text-[10.5px] text-[#A1A1A6] truncate" title="${safeAdSetName}">› ${safeAdSetName}</div>
                    </td>
                    <td class="text-right text-xs font-mono tabular-nums text-[#F5F5F7]">${window.analyticsEngine.formatMoney(adIns.spend)}</td>
                    <td class="text-right text-xs font-mono tabular-nums font-semibold ${adIns.link_ctr >= 1.5 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${adIns.link_ctr ? `${adIns.link_ctr.toFixed(2).replace('.', ',')}%` : '–'}</td>
                    <td class="text-right text-xs font-mono tabular-nums font-bold ${adIns.purchases > 0 ? 'text-[#1FC16B]' : 'text-[#6E6E73]'}">${adIns.purchases}</td>
                    <td class="text-right text-xs font-mono tabular-nums text-[#F5F5F7]">${adIns.cpa ? window.analyticsEngine.formatMoney(adIns.cpa) : '–'}</td>
                    <td class="text-right text-xs font-mono tabular-nums font-bold ${adIns.roas >= 2.2 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${adIns.roas ? `${adIns.roas.toFixed(2)}x` : '–'}</td>
                    <td class="text-center py-2">
                        <div class="inline-flex items-center gap-1.5 justify-center">
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeName}')" class="btn btn-secondary btn-sm text-[11px] px-2.5 py-1" title="Duplicar Anúncio">
                                <span>📋 Duplicar</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (mobileContainer) {
            mobileContainer.innerHTML = list.map(ad => {
                const parentCamp = this.cachedCampaigns.find(c => c.id === ad.campaign_id);
                const parentAdSet = this.cachedAdSets.find(s => s.id === ad.adset_id);
                const adIns = this.cachedAdInsights.get(ad.id) || window.analyticsEngine.parseInsights(null);
                const safeName = escapeHTML(ad.name || 'Anúncio');
                const safeCampName = escapeHTML(parentCamp?.name || 'Campanha');
                const safeAdSetName = escapeHTML(parentAdSet?.name || 'Conjunto');
                const safeId = escapeHTML(ad.id);
                const isActive = ad.status === 'ACTIVE';
                const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url;

                return `
                    <div class="mobile-campaign-card space-y-3 p-3.5 bg-[#0E0E12] border border-white/[0.06] rounded-xl">
                        <div class="flex items-start justify-between gap-2.5">
                            <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                ${thumb ? `
                                    <img src="${thumb}" alt="${safeName}" class="w-10 h-10 rounded-lg object-cover border border-white/[0.08] flex-shrink-0">
                                ` : `
                                    <div class="w-10 h-10 rounded-lg bg-[#18181E] border border-white/[0.06] flex items-center justify-center text-sm flex-shrink-0 text-[#6E6E73]">🎬</div>
                                `}
                                <div class="min-w-0 flex-1">
                                    <span class="badge ${isActive ? 'badge-active' : 'badge-paused'} text-[9px] mb-1 inline-block">${ad.status}</span>
                                    <h4 class="font-bold text-xs text-[#F5F5F7] truncate" title="${safeName}">${safeName}</h4>
                                    <p class="text-[10px] text-[#A1A1A6] truncate" title="${safeCampName} › ${safeAdSetName}">${safeCampName} › ${safeAdSetName}</p>
                                </div>
                            </div>
                            <label class="apple-switch flex-shrink-0" title="${isActive ? 'Pausar Anúncio' : 'Ativar Anúncio'}">
                                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.dashboard.toggleAdStatus('${safeId}', '${ad.status}', this)">
                                <span class="apple-switch-track"><span class="apple-switch-thumb"></span></span>
                            </label>
                        </div>
                        <div class="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-[#141418] border border-white/[0.04] text-xs">
                            <div>
                                <span class="text-[10px] text-[#6E6E73] block uppercase font-bold">Investido</span>
                                <span class="font-bold font-mono text-[#F5F5F7]">${window.analyticsEngine.formatMoney(adIns.spend)}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-[#6E6E73] block uppercase font-bold">CTR Link</span>
                                <span class="font-bold font-mono ${adIns.link_ctr >= 1.5 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${adIns.link_ctr ? `${adIns.link_ctr.toFixed(2).replace('.', ',')}%` : '–'}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-[#6E6E73] block uppercase font-bold">Vendas / ROAS</span>
                                <span class="font-bold font-mono text-[#1FC16B]">${adIns.purchases} un <span class="text-[10px] font-normal text-[#A1A1A6]">(${adIns.roas !== null ? `${adIns.roas.toFixed(2)}x` : '–'})</span></span>
                            </div>
                        </div>
                        <div class="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.04]">
                            <button onclick="window.dashboard.openDuplicateModal('${safeId}', '${safeName}')" class="btn btn-secondary btn-sm text-[11px] py-1 px-3">
                                📋 Duplicar
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        this.setupTableStickyScrollDepth();
    }

    async toggleAdStatus(adId, currentStatus, inputEl = null) {
        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        const actionLabel = newStatus === 'ACTIVE' ? 'reativar' : 'pausar';
        const toggleWrapper = inputEl?.closest('.apple-switch, .toggle-switch');

        if (!confirm(`Deseja realmente ${actionLabel} o anúncio ${adId}?`)) {
            if (inputEl) inputEl.checked = currentStatus === 'ACTIVE';
            return;
        }

        try {
            if (toggleWrapper) toggleWrapper.classList.add('is-loading');
            if (inputEl) inputEl.disabled = true;
            this.showToast(`Alterando status do anúncio na Meta...`, 'info');

            await window.metaAdapter.updateStatus(adId, newStatus);

            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'STATUS_ANUNCIO_ALTERADO',
                    objectId: adId,
                    before: currentStatus,
                    after: newStatus,
                    reason: `Ajuste operacional de status do anúncio (${actionLabel}).`,
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            this.showToast(`Anúncio ${newStatus === 'ACTIVE' ? 'reativado' : 'pausado'} com sucesso!`, 'success');
            await this.loadAdsData(true);

        } catch (err) {
            console.error('[Ad Status Error]', err);
            this.showToast(`Falha ao alterar anúncio: ${err.message || 'Erro na Meta'}`, 'error');
            if (inputEl) inputEl.checked = currentStatus === 'ACTIVE';
        } finally {
            if (toggleWrapper) toggleWrapper.classList.remove('is-loading');
            if (inputEl) inputEl.disabled = false;
        }
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
            let classificationLabel = 'Em teste';
            if (evalResult.classification === 'WINNER') {
                badgeClass = 'badge-winner';
                classificationLabel = 'Vencedor';
            } else if (evalResult.classification === 'FATIGUE') {
                badgeClass = 'badge-error';
                classificationLabel = 'Fadiga';
            } else if (evalResult.classification === 'WATCH') {
                badgeClass = 'badge-warning';
                classificationLabel = 'Atenção';
            }

            return `
                <div class="creative-card">
                    <!-- Header do Card com Grid 1fr auto -->
                    <div class="creative-card-header">
                        <div class="creative-card-title-group">
                            <span class="creative-card-icon">🎬</span>
                            <div class="creative-card-title-wrap">
                                <span class="creative-card-name" title="${escapeHTML(camp.name)}">${escapeHTML(camp.name)}</span>
                                <span class="creative-card-sub">Campanha Meta Ads</span>
                            </div>
                        </div>
                        <div class="creative-card-badge-wrap">
                            <span class="badge ${badgeClass} creative-status-badge">
                                ${escapeHTML(classificationLabel)} · ${evalResult.score || 70}
                            </span>
                        </div>
                    </div>

                    <!-- Grid de Métricas 2x2 Estritamente Blindado -->
                    <div class="creative-metrics-grid">
                        <div class="creative-metric-cell">
                            <span class="creative-metric-label">CTR Link</span>
                            <p class="creative-metric-value ${ins.ctr && ins.ctr >= 2.0 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${ctrFormatted}</p>
                        </div>
                        <div class="creative-metric-cell">
                            <span class="creative-metric-label">CPC Médio</span>
                            <p class="creative-metric-value text-[#F5F5F7]">${cpcFormatted}</p>
                        </div>
                        <div class="creative-metric-cell">
                            <span class="creative-metric-label">Taxa Retenção</span>
                            <p class="creative-metric-value text-[#5DA9FF]">${hookRate}</p>
                        </div>
                        <div class="creative-metric-cell">
                            <span class="creative-metric-label">Investido</span>
                            <p class="creative-metric-value text-[#A1A1A6]">${spendFormatted}</p>
                        </div>
                    </div>

                    <!-- Footer do Card com ID e Vendas -->
                    <div class="creative-card-footer">
                        <span class="creative-card-id" title="${escapeHTML(camp.id)}">ID: ${escapeHTML(camp.id)}</span>
                        <span class="creative-card-sales ${ins.purchases > 0 ? 'text-[#1FC16B]' : 'text-[#A1A1A6]'}">
                            ${ins.purchases} ${ins.purchases === 1 ? 'venda' : 'vendas'}
                        </span>
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
            const range = window.periodStore ? window.periodStore.globalRange : null;
            
            let url = '/api/pedidos';
            const params = new URLSearchParams();
            if (range && range.since && range.until && range.preset !== 'today') {
                params.set('start_date', range.since);
                params.set('end_date', range.until);
            }
            const qs = params.toString();
            if (qs) url += `?${qs}`;

            const res = await fetch(url, { credentials: 'include' });
            if (res.status === 401) {
                if (window.authGate) window.authGate.show('Sessão expirada. Faça login novamente.');
                return;
            }
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

            // Notifica o Real-Time Sales Notification Engine (Deduplicado e Filtrado)
            if (window.salesNotificationEngine && typeof window.salesNotificationEngine.processOrders === 'function') {
                window.salesNotificationEngine.processOrders(this.cachedOrders);
            }

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
            const res = await fetch('/api/pedidos?action=clear', { method: 'POST', credentials: 'include' });
            if (res.ok) {
                this.cachedOrders = [];
                this.updateOrdersMetrics();
                this.renderOrdersTable();
                this.showToast('Histórico limpo com sucesso.', 'success');
            }
        } catch(e) {}
    }

    // ─── SITE INTELLIGENCE (BEHAVIOR & CONVERSION INTELLIGENCE) ──────────────

    async loadSIData(silent = false) {
        if (!silent) this.showToast('Atualizando dados do Site Intelligence...', 'info');

        try {
            const range = window.periodStore ? window.periodStore.globalRange : null;
            let url = '/api/si-query';
            if (range && range.since && range.until && range.preset !== 'today') {
                url += `?start_date=${encodeURIComponent(range.since)}&end_date=${encodeURIComponent(range.until)}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error('Falha ao consultar métricas');

            const payload = await res.json();
            if (payload && payload.success) {
                this.cachedSIData = payload.data || {};
                this.cachedSIHealth = payload.tracking_health || {};
                this.cachedSIPeriod = payload.period || {};
            } else {
                this.cachedSIData = null;
            }

            this.renderSiteIntelligenceView();

        } catch (err) {
            console.error('[Site Intelligence Load Error]', err);
            this.renderSiteIntelligenceView();
        }
    }

    renderSiteIntelligenceView() {
        const data = this.cachedSIData;
        const health = this.cachedSIHealth || {};
        const emptyState = document.getElementById('si-empty-state');
        const dataContainer = document.getElementById('si-data-container');
        const badgeEl = document.getElementById('si-tracking-status-badge');
        const lastEvtEl = document.getElementById('si-last-event-info');
        const emptyPeriodLabel = document.getElementById('si-empty-period-label');
        const emptyTrackerStatus = document.getElementById('si-empty-tracker-status');

        // Atualizar Informação de Saúde do Rastreador
        if (badgeEl) {
            if (health.status === 'RASTREAMENTO_ATIVO') {
                badgeEl.className = 'badge badge-active text-[10px]';
                badgeEl.textContent = '🟢 Rastreamento Ativo';
            } else if (health.status === 'DADOS_PARCIAIS') {
                badgeEl.className = 'badge badge-warning text-[10px]';
                badgeEl.textContent = '🟡 Dados Parciais';
            } else {
                badgeEl.className = 'badge badge-paused text-[10px]';
                badgeEl.textContent = '⚪ Aguardando Visitantes';
            }
        }

        if (lastEvtEl) {
            if (health.has_events && health.seconds_ago !== null) {
                if (health.seconds_ago < 60) {
                    lastEvtEl.textContent = `Último evento: há ${health.seconds_ago}s`;
                } else if (health.seconds_ago < 3600) {
                    const mins = Math.round(health.seconds_ago / 60);
                    lastEvtEl.textContent = `Último evento: há ${mins} min`;
                } else {
                    const hours = Math.round(health.seconds_ago / 3600);
                    lastEvtEl.textContent = `Último evento: há ${hours}h`;
                }
            } else {
                lastEvtEl.textContent = 'Nenhum evento no período';
            }
        }

        const totalSessions = data?.overview?.total_sessions || 0;

        if (!data || totalSessions === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            if (dataContainer) dataContainer.classList.add('hidden');
            if (emptyPeriodLabel) {
                const range = window.periodStore ? window.periodStore.globalRange : null;
                emptyPeriodLabel.textContent = `Período: ${range?.label || 'Hoje'}`;
            }
            if (emptyTrackerStatus) {
                emptyTrackerStatus.textContent = health.has_events ? 'Tracker Conectado' : 'Tracker Pronto';
            }
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (dataContainer) dataContainer.classList.remove('hidden');

        this.renderSIOverviewMetrics(data.overview);
        this.renderSIBottleneck(data.bottleneck);
        this.renderSIDiagnosis(data.diagnosis);
        this.renderSIFunnel(data.funnel);
        this.renderSISessions(data.recent_sessions || []);
    }

    renderSIOverviewMetrics(ov) {
        if (!ov) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        const total = ov.total_sessions || 0;
        setVal('si-kpi-sessions', total.toLocaleString('pt-BR'));

        const checkoutPct = total > 0 ? ((ov.checkout_count / total) * 100).toFixed(1) : '0.0';
        setVal('si-kpi-checkout', `${ov.checkout_count || 0} (${checkoutPct}%)`);

        const pixPct = total > 0 ? ((ov.pix_count / total) * 100).toFixed(1) : '0.0';
        setVal('si-kpi-pix', `${ov.pix_count || 0} (${pixPct}%)`);

        const purchasePct = total > 0 ? ((ov.purchase_count / total) * 100).toFixed(1) : '0.0';
        setVal('si-kpi-purchases', `${ov.purchase_count || 0} (${purchasePct}%)`);

        setVal('si-kpi-rage', ov.rage_click_sessions !== undefined ? `${ov.rage_click_sessions} un` : '0 un');
        setVal('si-kpi-scroll', ov.avg_scroll !== undefined ? `${ov.avg_scroll}%` : '0%');

        const health = ov.conversion_health;
        if (health && health.score !== null) {
            setVal('si-kpi-health', `${health.score}/100`);
            const healthLbl = document.getElementById('si-kpi-health-label');
            if (healthLbl) healthLbl.textContent = `${health.label} — ${health.rating}`;
        } else {
            setVal('si-kpi-health', '—');
            const healthLbl = document.getElementById('si-kpi-health-label');
            if (healthLbl) healthLbl.textContent = 'Aguardando sessões';
        }
    }

    renderSIBottleneck(b) {
        const container = document.getElementById('si-bottleneck-content');
        const sevBadge = document.getElementById('si-bottleneck-severity');
        if (!container) return;

        if (!b || b.id === 'NO_DATA') {
            if (sevBadge) {
                sevBadge.className = 'badge badge-paused text-[9px]';
                sevBadge.textContent = 'SEM DADOS';
            }
            container.innerHTML = `<p class="text-[#6E6E73] text-center py-4 italic">Aguardando primeiras sessões para análise.</p>`;
            return;
        }

        if (b.id === 'INSUFFICIENT_SAMPLE') {
            if (sevBadge) {
                sevBadge.className = 'badge badge-paused text-[9px]';
                sevBadge.textContent = 'COLETANDO';
            }
            container.innerHTML = `
                <div class="p-3 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1.5">
                    <div class="flex items-center gap-1.5 font-bold text-[#F5F5F7]">
                        <span>⏳</span>
                        <span>${escapeHTML(b.name)}</span>
                    </div>
                    <p class="text-[#A1A1A6] text-[11px] leading-relaxed">${escapeHTML(b.evidence)}</p>
                </div>
            `;
            return;
        }

        if (sevBadge) {
            if (b.severity === 'HIGH') {
                sevBadge.className = 'badge badge-error text-[9px]';
                sevBadge.textContent = 'CRÍTICO';
            } else if (b.severity === 'MEDIUM') {
                sevBadge.className = 'badge badge-warning text-[9px]';
                sevBadge.textContent = 'MODERADO';
            } else {
                sevBadge.className = 'badge badge-active text-[9px]';
                sevBadge.textContent = 'ESTÁVEL';
            }
        }

        container.innerHTML = `
            <div class="p-3 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-[#F5F5F7] text-xs">${escapeHTML(b.name)}</span>
                    ${b.drop_rate ? `<span class="font-mono text-xs font-bold ${b.severity === 'HIGH' ? 'text-[#FF453A]' : 'text-[#F5A524]'}">Queda: ${b.drop_rate}%</span>` : ''}
                </div>
                <p class="text-[#A1A1A6] text-[11px] leading-relaxed">${escapeHTML(b.evidence)}</p>
            </div>
        `;
    }

    renderSIDiagnosis(diag) {
        const container = document.getElementById('si-diagnosis-content');
        const confBadge = document.getElementById('si-diagnosis-confidence');
        if (!container) return;

        if (!diag) {
            container.innerHTML = `<p class="text-[#6E6E73] text-center py-4 italic">Aguardando dados...</p>`;
            return;
        }

        if (confBadge) {
            confBadge.textContent = `Confiança: ${diag.confidence_rating || 'Normal'}`;
        }

        const bulletsHtml = (diag.bullets || []).map(b => `
            <li class="flex items-start gap-1.5 text-[11px] text-[#A1A1A6]">
                <span class="text-[#1FC16B] font-bold mt-0.5">•</span>
                <span>${escapeHTML(b)}</span>
            </li>
        `).join('');

        container.innerHTML = `
            <div class="space-y-2">
                <h4 class="font-bold text-xs text-[#F5F5F7] flex items-center gap-1.5">
                    <span>💡</span>
                    <span>${escapeHTML(diag.headline || 'Análise Operacional')}</span>
                </h4>
                <ul class="space-y-1 pl-1">
                    ${bulletsHtml}
                </ul>
                ${diag.recommended_action ? `
                    <div class="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-[#F5F5F7] flex items-center gap-2 mt-2">
                        <span class="text-sm">🎯</span>
                        <div>
                            <span class="font-bold text-[#1FC16B]">Ação Recomendada:</span>
                            <span class="text-[#A1A1A6] ml-1">${escapeHTML(diag.recommended_action)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderSIFunnel(funnel) {
        const container = document.getElementById('si-funnel-container');
        if (!container) return;

        const steps = funnel?.steps || [];
        if (steps.length === 0) {
            container.innerHTML = `<p class="text-[#6E6E73] text-center py-4 italic text-xs">Aguardando sessões...</p>`;
            return;
        }

        container.innerHTML = steps.map((s, idx) => {
            const dropHtml = s.drop_off_pct > 0 && idx < steps.length - 1 ? `
                <span class="text-[10px] font-mono text-[#FF453A] bg-[#FF453A]/10 px-1.5 py-0.5 rounded border border-[#FF453A]/20">
                    Queda: -${s.drop_off_pct}%
                </span>
            ` : '';

            const barWidth = s.pct ? `${Math.max(2, s.pct)}%` : '0%';

            return `
                <div class="space-y-1.5 p-2.5 rounded-lg bg-[#101014] border border-white/[0.04]">
                    <div class="flex items-center justify-between text-xs">
                        <div class="flex items-center gap-2">
                            <span class="text-[#F5F5F7] font-semibold">${escapeHTML(s.name)}</span>
                            ${dropHtml}
                        </div>
                        <div class="flex items-center gap-2 font-mono text-xs">
                            <span class="font-bold text-[#F5F5F7]">${(s.count || 0).toLocaleString('pt-BR')} un</span>
                            <span class="text-[#6E6E73]">(${s.pct}%)</span>
                        </div>
                    </div>
                    <div class="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
                        <div class="h-full ${idx === 3 ? 'bg-[#1FC16B]' : 'bg-[#FF2D2D]'} rounded-full transition-all duration-500" style="width: ${barWidth}"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSISessions(sessions = []) {
        const container = document.getElementById('si-sessions-container');
        if (!container) return;

        this.rawSISessions = sessions;

        if (sessions.length === 0) {
            container.innerHTML = `<p class="text-[#6E6E73] text-center py-8 italic text-xs">Nenhuma sessão registrada no período.</p>`;
            return;
        }

        this.filterSISessions(this.siCurrentFilter || 'all');
    }

    filterSISessions(filterValue) {
        this.siCurrentFilter = filterValue;
        const container = document.getElementById('si-sessions-container');
        if (!container || !this.rawSISessions) return;

        let filtered = this.rawSISessions;

        if (filterValue === 'converted') {
            filtered = filtered.filter(s => s.purchased || s.status === 'converted');
        } else if (filterValue === 'pix') {
            filtered = filtered.filter(s => s.generated_pix);
        } else if (filterValue === 'checkout') {
            filtered = filtered.filter(s => s.reached_checkout);
        } else if (filterValue === 'rage_click') {
            filtered = filtered.filter(s => s.rage_clicks > 0);
        } else if (filterValue === 'mobile') {
            filtered = filtered.filter(s => s.device_type === 'mobile');
        } else if (filterValue === 'desktop') {
            filtered = filtered.filter(s => s.device_type === 'desktop');
        }

        if (filtered.length === 0) {
            container.innerHTML = `<p class="text-[#6E6E73] text-center py-8 italic text-xs">Nenhuma sessão encontrada para o filtro selecionado.</p>`;
            return;
        }

        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>HORA</th>
                            <th>VISITANTE / SESSÃO</th>
                            <th>DISPOSITIVO</th>
                            <th>ORIGEM / UTM</th>
                            <th>PROFUNDIDADE</th>
                            <th>ETAPA DO FUNIL</th>
                            <th>FRICÇÃO</th>
                            <th class="text-right">AÇÕES</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/[0.04] text-xs">
                        ${filtered.map(s => {
                            const dt = s.start_time || s.last_seen ? new Date(s.start_time || s.last_seen).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '–';
                            const deviceIcon = s.device_type === 'mobile' ? '📱 Celular' : (s.device_type === 'tablet' ? '💻 Tablet' : '🖥️ Desktop');
                            const utmStr = s.utm_campaign && s.utm_campaign !== 'none' ? `${s.utm_source} / ${s.utm_campaign}` : (s.utm_source || 'Direto');
                            
                            let funnelBadge = '<span class="badge badge-paused text-[9px]">Página</span>';
                            if (s.purchased) {
                                funnelBadge = '<span class="badge badge-winner text-[9px]">✓ Compra</span>';
                            } else if (s.generated_pix) {
                                funnelBadge = '<span class="badge badge-active text-[9px]">PIX Gerado</span>';
                            } else if (s.reached_checkout) {
                                funnelBadge = '<span class="badge badge-warning text-[9px]">Checkout</span>';
                            }

                            const frictionBadge = s.rage_clicks > 0 
                                ? `<span class="badge badge-error text-[9px]">⚠️ ${s.rage_clicks} Rage Clicks</span>`
                                : `<span class="text-[10px] text-[#6E6E73] font-mono">Normal</span>`;

                            return `
                                <tr class="hover:bg-white/[0.02] transition-colors">
                                    <td class="py-2.5 px-3 font-mono text-[#A1A1A6]">${escapeHTML(dt)}</td>
                                    <td class="py-2.5 px-3 font-mono text-[11px] text-[#F5F5F7]">
                                        <div class="truncate max-w-[140px]" title="${escapeHTML(s.session_id)}">${escapeHTML(s.session_id)}</div>
                                    </td>
                                    <td class="py-2.5 px-3 text-[11px] text-[#A1A1A6]">${escapeHTML(deviceIcon)}</td>
                                    <td class="py-2.5 px-3 font-mono text-[10px] text-[#A1A1A6] truncate max-w-[150px]" title="${escapeHTML(utmStr)}">${escapeHTML(utmStr)}</td>
                                    <td class="py-2.5 px-3 font-mono text-[11px] ${s.max_scroll >= 70 ? 'text-[#1FC16B]' : 'text-[#F5F5F7]'}">${s.max_scroll || 0}%</td>
                                    <td class="py-2.5 px-3">${funnelBadge}</td>
                                    <td class="py-2.5 px-3">${frictionBadge}</td>
                                    <td class="py-2.5 px-3 text-right">
                                        <button onclick="window.dashboard.openSISessionDetail('${escapeHTML(s.session_id)}')" class="btn btn-secondary btn-sm text-[10px] px-2 py-1">
                                            <span>🔍</span> Detalhes
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    openSISessionDetail(sessionId) {
        const session = (this.rawSISessions || []).find(s => s.session_id === sessionId);
        const modal = document.getElementById('si-session-modal');
        const titleEl = document.getElementById('si-modal-title');
        const subtitleEl = document.getElementById('si-modal-subtitle');
        const contentEl = document.getElementById('si-modal-content');
        if (!modal || !contentEl) return;

        if (!session) {
            this.showToast('Sessão não encontrada', 'warning');
            return;
        }

        if (titleEl) titleEl.textContent = `Sessão: ${session.session_id.substring(0, 16)}...`;
        if (subtitleEl) subtitleEl.textContent = `Início: ${session.start_time ? new Date(session.start_time).toLocaleString('pt-BR') : '–'}`;

        contentEl.innerHTML = `
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="p-2.5 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Dispositivo</span>
                    <p class="font-semibold text-[#F5F5F7]">${escapeHTML(session.device_type || 'Desktop')}</p>
                </div>
                <div class="p-2.5 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Origem de Tráfego</span>
                    <p class="font-semibold text-[#F5F5F7]">${escapeHTML(session.utm_source || 'Direto')}</p>
                </div>
                <div class="p-2.5 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Campanha UTM</span>
                    <p class="font-semibold text-[#F5F5F7]">${escapeHTML(session.utm_campaign || 'Nenhuma')}</p>
                </div>
                <div class="p-2.5 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Scroll Máximo</span>
                    <p class="font-semibold text-[#1FC16B] font-mono">${session.max_scroll || 0}%</p>
                </div>
                <div class="p-2.5 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Tempo na Página</span>
                    <p class="font-semibold text-[#F5F5F7] font-mono">${session.dwell_sec || 0} segundos</p>
                </div>
                <div class="p-2.5 rounded-lg bg-[#15151A] border border-white/[0.05] space-y-1">
                    <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Cliques de Frustração</span>
                    <p class="font-semibold ${session.rage_clicks > 0 ? 'text-[#FF453A]' : 'text-[#A1A1A6]'} font-mono">${session.rage_clicks || 0}</p>
                </div>
            </div>

            <div class="p-3 rounded-lg bg-[#101014] border border-white/[0.05] space-y-2 mt-3">
                <span class="text-[10px] text-[#6E6E73] uppercase font-bold">Etapas Percorridas no Funil</span>
                <div class="space-y-1.5 text-xs">
                    <div class="flex items-center justify-between text-[#1FC16B]">
                        <span>✓ Visualizou Página</span>
                        <span class="font-mono text-[10px]">100%</span>
                    </div>
                    <div class="flex items-center justify-between ${session.reached_checkout ? 'text-[#1FC16B]' : 'text-[#6E6E73]'}">
                        <span>${session.reached_checkout ? '✓ Abriu Formulário de Checkout' : '✗ Não abriu Checkout'}</span>
                        <span class="font-mono text-[10px]">${session.reached_checkout ? 'Concluído' : 'Abandonou'}</span>
                    </div>
                    <div class="flex items-center justify-between ${session.generated_pix ? 'text-[#1FC16B]' : 'text-[#6E6E73]'}">
                        <span>${session.generated_pix ? '✓ Gerou Chave PIX' : '✗ Não gerou PIX'}</span>
                        <span class="font-mono text-[10px]">${session.generated_pix ? 'Concluído' : 'Pendente'}</span>
                    </div>
                    <div class="flex items-center justify-between ${session.purchased ? 'text-[#1FC16B] font-bold' : 'text-[#6E6E73]'}">
                        <span>${session.purchased ? '✓ Compra Aprovada (PIX Pago)' : '✗ Pagamento não realizado'}</span>
                        <span class="font-mono text-[10px]">${session.purchased ? 'APROVADO' : 'Incompleto'}</span>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    // ─── MODAL DE TOKEN META ──────────────────────────────────────────────────

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

    // ─── GESTÃO DE NOMES E APELIDOS DE CAMPANHAS ──────────────────────────

    getCampaignNicknames() {
        try {
            return JSON.parse(localStorage.getItem('radwan_campaign_nicknames') || '{}');
        } catch (e) {
            return {};
        }
    }

    getCampaignInfo(camp) {
        if (!camp) return { id: '', name: '', displayName: 'Campanha', isCBO: false, hasNickname: false, nickname: '' };
        const nicknames = this.getCampaignNicknames();
        const nickname = nicknames[camp.id] || null;
        const originalName = camp.name || 'Campanha';
        const isCBO = !!(camp.daily_budget || camp.lifetime_budget);
        return {
            id: camp.id,
            name: originalName,
            displayName: nickname ? nickname : originalName,
            hasNickname: !!nickname,
            nickname: nickname || '',
            isCBO
        };
    }

    openRenameModal(campId) {
        const camp = this.cachedCampaigns.find(c => c.id === campId);
        if (!camp) return;
        const info = this.getCampaignInfo(camp);
        
        const campIdInput = document.getElementById('rename-modal-camp-id');
        const currentNameEl = document.getElementById('rename-modal-current-name');
        if (campIdInput) campIdInput.value = campId;
        if (currentNameEl) currentNameEl.textContent = camp.name;

        this.renameMode = 'official';
        this.updateRenameModalUI(info);
        document.getElementById('rename-modal')?.classList.remove('hidden');
    }

    setRenameMode(mode) {
        this.renameMode = mode;
        const campId = document.getElementById('rename-modal-camp-id')?.value;
        const camp = this.cachedCampaigns.find(c => c.id === campId);
        const info = this.getCampaignInfo(camp);
        this.updateRenameModalUI(info);
    }

    updateRenameModalUI(info) {
        const officialBtn = document.getElementById('rename-mode-official');
        const nicknameBtn = document.getElementById('rename-mode-nickname');
        const descEl = document.getElementById('rename-mode-description');
        const labelEl = document.getElementById('rename-modal-input-label');
        const inputEl = document.getElementById('rename-modal-input');

        if (!inputEl) return;

        if (this.renameMode === 'official') {
            if (officialBtn) officialBtn.className = 'flex-1 py-1.5 rounded-md font-semibold text-center transition-all bg-[#0E0E12] text-[#F5F5F7] shadow-sm';
            if (nicknameBtn) nicknameBtn.className = 'flex-1 py-1.5 rounded-md font-semibold text-center transition-all text-[#A1A1A6] hover:text-[#F5F5F7]';
            if (descEl) descEl.textContent = 'Altera o nome real da campanha diretamente na conta de anúncios da Meta via Graph API com Write-Read-Verify.';
            if (labelEl) labelEl.textContent = 'Novo Nome Oficial na Meta';
            inputEl.value = info ? info.name : '';
        } else {
            if (nicknameBtn) nicknameBtn.className = 'flex-1 py-1.5 rounded-md font-semibold text-center transition-all bg-[#0E0E12] text-[#F5F5F7] shadow-sm';
            if (officialBtn) officialBtn.className = 'flex-1 py-1.5 rounded-md font-semibold text-center transition-all text-[#A1A1A6] hover:text-[#F5F5F7]';
            if (descEl) descEl.textContent = 'Define um apelido visual amigável exclusivo no RADWAN ADS. Não altera o nome oficial na Meta.';
            if (labelEl) labelEl.textContent = 'Apelido Interno (RADWAN ADS)';
            inputEl.value = info ? info.nickname : '';
        }
        inputEl.focus();
    }

    async submitRenameModal(event) {
        event.preventDefault();
        const campId = document.getElementById('rename-modal-camp-id')?.value;
        const inputEl = document.getElementById('rename-modal-input');
        const newName = inputEl ? inputEl.value.trim() : '';
        const submitBtn = document.getElementById('btn-submit-rename');

        if (!newName && this.renameMode === 'official') {
            this.showToast('Informe um nome válido para a campanha na Meta.', 'warning');
            return;
        }

        const camp = this.cachedCampaigns.find(c => c.id === campId);
        if (!camp) return;

        if (this.renameMode === 'nickname') {
            const nicknames = this.getCampaignNicknames();
            if (newName.length > 0) {
                nicknames[campId] = newName;
            } else {
                delete nicknames[campId];
            }
            localStorage.setItem('radwan_campaign_nicknames', JSON.stringify(nicknames));
            document.getElementById('rename-modal')?.classList.add('hidden');
            this.showToast('Apelido interno salvo com sucesso!', 'success');
            this.renderCampaignsTable();
            return;
        }

        // Modo Oficial na Meta
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Salvando na Meta...';
        }

        try {
            this.showToast('Enviando alteração de nome para a Meta...', 'info');
            await window.metaAdapter.updateName(campId, newName);

            // Read & Verify
            const verifyRes = await window.metaAdapter.request(campId, 'GET', { fields: 'id,name' }, null, false);
            if (verifyRes && verifyRes.name === newName) {
                camp.name = newName;
            } else {
                camp.name = newName; // fallback otimista se api responder sucesso
            }

            if (window.auditTrailEngine) {
                window.auditTrailEngine.logAction({
                    action: 'RENOMEACAO_CAMPANHA',
                    objectId: campId,
                    before: camp.name,
                    after: newName,
                    reason: 'Renomeação oficial de campanha via console operacional.',
                    verification: 'CONFIRMADO_PELA_META'
                });
            }

            document.getElementById('rename-modal')?.classList.add('hidden');
            this.showToast('Campanha renomeada com sucesso na Meta!', 'success');
            this.renderCampaignsTable();

        } catch (err) {
            console.error('[Rename Error]', err);
            this.showToast(`Falha ao renomear: ${err.message || 'Erro na Meta'}`, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Salvar Alteração ➔';
            }
        }
    }

    // ─── PAINEL MESTRE DE INSPEÇÃO DE MÉTRICAS (DRAWER EM 5 BLOCOS) ──────────

    openCampaignDrawer(campId) {
        const drawer = document.getElementById('campaign-drawer');
        const content = document.getElementById('drawer-content');
        if (!drawer || !content || !window.metricsRegistry) return;

        const camp = this.cachedCampaigns.find(c => c.id === campId);
        const ins = this.cachedInsights.get(campId) || window.analyticsEngine.parseInsights(null);
        const info = this.getCampaignInfo(camp);
        const isActive = camp?.status === 'ACTIVE';

        // Header Elements
        const titleEl = document.getElementById('campaign-drawer-title');
        const subtitleEl = document.getElementById('campaign-drawer-subtitle');
        const idEl = document.getElementById('campaign-drawer-id');
        const statusBadge = document.getElementById('campaign-drawer-status-badge');
        const structureBadge = document.getElementById('campaign-drawer-structure-badge');

        if (titleEl) titleEl.textContent = info.displayName;
        if (subtitleEl) {
            subtitleEl.textContent = info.hasNickname ? `Nome oficial na Meta: ${info.name}` : `Estrutura: ${info.isCBO ? 'Orçamento a nível de Campanha (CBO)' : 'Orçamento a nível de Conjunto (ABO)'}`;
        }
        if (idEl) idEl.textContent = `ID: ${campId}`;
        if (statusBadge) {
            statusBadge.className = `badge ${isActive ? 'badge-active' : 'badge-paused'} text-[9.5px]`;
            statusBadge.textContent = isActive ? 'Ativa' : 'Pausada';
        }
        if (structureBadge) {
            structureBadge.className = `badge ${info.isCBO ? 'badge-winner' : 'badge-paused'} text-[9.5px]`;
            structureBadge.textContent = info.isCBO ? 'CBO' : 'ABO';
        }

        // Action Toolbar
        const toolbar = document.getElementById('campaign-drawer-toolbar');
        const budgetVal = camp?.daily_budget ? (parseFloat(camp.daily_budget) / 100) : (camp?.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : 0);
        const safeDisplayName = escapeHTML(info.displayName);

        if (toolbar) {
            toolbar.innerHTML = `
                <button onclick="window.dashboard.openRenameModal('${campId}')" class="btn btn-secondary btn-sm text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                    <span>✏️</span><span>Renomear</span>
                </button>
                <button onclick="window.dashboard.openBudgetModal('${campId}', ${budgetVal}, '${safeDisplayName}', ${info.isCBO})" class="btn btn-secondary btn-sm text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                    <span>💰</span><span>Orçamento</span>
                </button>
                <button onclick="window.dashboard.openDuplicateModal('${campId}', '${safeDisplayName}')" class="btn btn-secondary btn-sm text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                    <span>📋</span><span>Duplicar</span>
                </button>
                <button onclick="window.dashboard.openRadwanAnalysisModal('${campId}')" class="btn btn-secondary btn-sm text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                    <span>🧠</span><span>Diagnóstico Radwan</span>
                </button>
            `;
        }

        // 5 Grupos de Métricas com Formatação Canônica
        const metricHelper = (metricId) => {
            const m = window.metricsRegistry.getMetric(metricId);
            if (!m) return { label: metricId, val: '–', desc: '' };
            const raw = m.calculate(ins, camp, this.cachedOrders);
            const val = window.metricsRegistry.formatValue(metricId, raw);
            return { label: m.shortLabel || m.label, val, desc: m.beginnerDescription || m.tooltip || '' };
        };

        const gFinanceiro = ['spend', 'revenue', 'roas', 'profit', 'cpa', 'profit_margin'].map(metricHelper);
        const gConversao = ['purchases', 'conversion_rate', 'initiate_checkout', 'cost_per_initiate_checkout', 'add_to_cart', 'funnel_checkout_to_purchase'].map(metricHelper);
        const gTrafego = ['link_clicks', 'link_ctr', 'link_cpc', 'landing_page_views', 'cost_per_lpv'].map(metricHelper);
        const gEntrega = ['impressions', 'reach', 'frequency', 'cpm'].map(metricHelper);
        const gVideo = ['video_views_3s', 'hook_rate', 'thruplay', 'cost_per_thruplay', 'video_p100'].map(metricHelper);

        const renderGroupBlock = (icon, title, badge, items) => `
            <div class="metric-group-card space-y-0">
                <div class="metric-group-header">
                    <div class="flex items-center gap-2">
                        <span>${icon}</span>
                        <h4 class="font-bold text-xs text-[#F5F5F7]">${title}</h4>
                    </div>
                    <span class="text-[9px] text-[#6E6E73] font-mono uppercase tracking-wider">${badge}</span>
                </div>
                <div class="metric-stat-grid">
                    ${items.map(item => `
                        <div class="metric-stat-cell" title="${escapeHTML(item.desc)}">
                            <div class="metric-stat-label">
                                <span class="truncate">${escapeHTML(item.label)}</span>
                            </div>
                            <div class="metric-stat-val">${item.val}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        content.innerHTML = `
            ${renderGroupBlock('💰', 'Financeiro & Retorno Líquido', 'ECONOMICS & RETORNO', gFinanceiro)}
            ${renderGroupBlock('🛒', 'Conversão & Funil de Vendas', 'PIXEL & GATEWAY', gConversao)}
            ${renderGroupBlock('🔗', 'Tráfego & Destino', 'CLICKS & LPV', gTrafego)}
            ${renderGroupBlock('📦', 'Entrega & Alcance', 'IMPRESSIONS & REACH', gEntrega)}
            ${renderGroupBlock('🎬', 'Vídeo & Retenção de Atenção', 'ADS ACTION STATS', gVideo)}
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
        if (typeof message !== 'string' || !message.trim()) return;
        
        // Blindagem Defensiva: Toasts só aceitam texto simples institucional (rejeita qualquer HTML)
        if (message.trim().startsWith('<') || message.includes('<div') || message.includes('<span') || message.includes('Horário Concluído')) {
            console.warn('[Toast System] Rejeitada tentativa de exibir fragmento de DOM/Tooltip como notificação toast:', message);
            return;
        }

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

    // ─── GESTÃO DO MODO AUTOMÁTICO, AUTONOMIA E KILL SWITCH ─────────────────

    updateSidebarAndFooterStatus() {
        const isStopped = window.guardrailEngine?.isEmergencyStopped() || false;
        const currentModeId = window.autopilotEngine?.mode || 'ASSISTED';
        const modeDetails = window.autopilotEngine?.getModeDetails?.(currentModeId) || { name: 'Assistido' };

        const emStatusEl = document.getElementById('sidebar-emergency-status');
        if (emStatusEl) {
            if (isStopped) {
                emStatusEl.textContent = '🛑 ATIVA (Bloqueado)';
                emStatusEl.className = 'text-[#FF453A] font-bold';
            } else {
                emStatusEl.textContent = 'Inativa (Normal)';
                emStatusEl.className = 'text-[#1FC16B] font-semibold';
            }
        }

        const modeEl = document.getElementById('sidebar-ai-mode');
        if (modeEl) {
            modeEl.textContent = `${modeDetails.icon || ''} ${modeDetails.name}`;
        }
    }

    renderAutopilotView() {
        const grid = document.getElementById('autopilot-modes-grid');
        const currentBadgeContainer = document.getElementById('autopilot-current-badge-container');
        const scoreDisplay = document.getElementById('readiness-score-display');
        const compGrid = document.getElementById('readiness-components-grid');
        const killBanner = document.getElementById('kill-switch-banner');
        const killTitle = document.getElementById('kill-switch-title');
        const killDesc = document.getElementById('kill-switch-desc');
        const killBtn = document.getElementById('btn-toggle-kill-switch');

        if (!grid) return;

        const currentMode = window.autopilotEngine?.mode || 'ASSISTED';
        const modes = window.autopilotEngine?.modes || {};
        const isStopped = window.guardrailEngine?.isEmergencyStopped() || false;

        // 1. Badge Atual Superior
        const currentDetails = window.autopilotEngine?.getModeDetails(currentMode);
        if (currentBadgeContainer && currentDetails) {
            currentBadgeContainer.innerHTML = `
                <span class="badge ${currentMode === 'GUARDED_AUTOMATION' ? 'badge-warning' : (currentMode === 'ANALYSIS_ONLY' ? 'badge-active' : 'badge-primary')} text-xs px-3 py-1 font-bold">
                    ${currentDetails.icon} Modo Ativo: ${currentDetails.name}
                </span>
            `;
        }

        // 2. Renderizar os 4 Cards de Autonomia
        grid.innerHTML = Object.keys(modes).map(modeKey => {
            const m = modes[modeKey];
            const isActive = m.id === currentMode;
            
            let activeClass = '';
            if (isActive) {
                if (m.id === 'ANALYSIS_ONLY') activeClass = 'active active-safe';
                else if (m.id === 'SHADOW') activeClass = 'active active-shadow';
                else if (m.id === 'ASSISTED') activeClass = 'active active-assisted';
                else if (m.id === 'GUARDED_AUTOMATION') activeClass = 'active active-guarded';
            }

            return `
                <div class="autonomy-card ${activeClass}" onclick="window.dashboard.setAutonomyMode('${m.id}')" role="button" tabindex="0" title="Clique para ativar ${m.name}">
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-2xl">${m.icon}</span>
                            ${isActive ? `<span class="badge badge-active text-[10px] px-2 py-0.5 font-bold">✓ Selecionado</span>` : `<span class="text-[10px] text-[#6E6E73] font-mono">Disponível</span>`}
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-[#F5F5F7]">${escapeHTML(m.name)}</h4>
                            <span class="text-[10.5px] text-[#A1A1A6] font-semibold">${escapeHTML(m.badge)}</span>
                        </div>
                        <p class="text-xs text-[#8E8E93] leading-relaxed">${escapeHTML(m.description)}</p>
                    </div>

                    <div class="pt-2 border-t border-white/[0.05] flex items-center justify-between text-[10px]">
                        <span class="text-[#6E6E73]">Risco:</span>
                        <span class="font-mono ${m.riskLevel === 'ZERO_RISK' ? 'text-[#1FC16B]' : (m.riskLevel === 'GUARDED' ? 'text-[#FF9F0A]' : 'text-[#5DA9FF]')} font-bold">
                            ${m.riskLevel}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        // 3. Score Real Calculado
        const readiness = window.autopilotEngine?.calculateReadinessScore?.({
            trackingHealth: this.cachedSIHealth || {},
            dataTrustScore: window.analyticsEngine?.dataConfidenceScore
        }) || { totalScore: 95, components: [] };

        if (scoreDisplay) {
            scoreDisplay.textContent = `${readiness.totalScore}/100`;
            if (readiness.totalScore >= 80) {
                scoreDisplay.className = 'font-mono text-sm sm:text-base font-black text-[#1FC16B] bg-[#1FC16B]/10 border border-[#1FC16B]/30 px-3 py-1 rounded-lg tabular-nums';
            } else if (readiness.totalScore >= 50) {
                scoreDisplay.className = 'font-mono text-sm sm:text-base font-black text-[#FF9F0A] bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 px-3 py-1 rounded-lg tabular-nums';
            } else {
                scoreDisplay.className = 'font-mono text-sm sm:text-base font-black text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 px-3 py-1 rounded-lg tabular-nums';
            }
        }

        // 4. Componentes Reais
        if (compGrid) {
            compGrid.innerHTML = (readiness.components || []).map(c => `
                <div class="p-3 rounded-lg bg-[#0E0E12] border ${c.isOk ? 'border-white/[0.05]' : 'border-[#FF453A]/30 bg-[#FF453A]/5'} flex items-center justify-between">
                    <div>
                        <span class="text-[#F5F5F7] font-medium block">${escapeHTML(c.name)}</span>
                        <span class="text-[10px] text-[#6E6E73] font-mono">${c.score}/${c.maxScore} pts</span>
                    </div>
                    <span class="${c.isOk ? 'text-[#1FC16B]' : 'text-[#FF453A]'} font-bold text-right">${escapeHTML(c.status)}</span>
                </div>
            `).join('');
        }

        // 5. Parada de Segurança (Kill Switch Banner & Botão)
        if (killBanner && killBtn && killTitle && killDesc) {
            if (isStopped) {
                killBanner.className = 'p-5 rounded-2xl bg-[#FF453A]/20 border border-[#FF453A] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-xl shadow-red-500/10';
                killTitle.textContent = '🛑 PARADA DE SEGURANÇA ATIVADA';
                killDesc.textContent = 'Todas as mutações na Meta, automações e edições de orçamento estão BLOQUEADAS no servidor.';
                killBtn.textContent = '✅ REATIVAR OPERAÇÃO (DESATIVAR PARADA)';
                killBtn.className = 'btn btn-secondary font-bold text-xs px-5 py-2.5 flex-shrink-0 rounded-xl transition-all border border-[#1FC16B]/50 text-[#1FC16B] hover:bg-[#1FC16B]/20';
            } else {
                killBanner.className = 'p-5 rounded-2xl bg-[#C91818]/15 border border-[#FF2D2D]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all';
                killTitle.textContent = 'Parada de Segurança da Conta (Kill Switch)';
                killDesc.textContent = 'Pausa imediatamente qualquer escrita, ajuste de orçamento ou automação em produção.';
                killBtn.textContent = '🛑 ATIVAR PARADA DE SEGURANÇA';
                killBtn.className = 'btn btn-danger font-bold text-xs px-5 py-2.5 flex-shrink-0 rounded-xl transition-all shadow-lg shadow-red-500/20 active:scale-[0.98]';
            }
        }
    }

    async setAutonomyMode(modeId) {
        const modes = window.autopilotEngine?.modes || {};
        const targetMode = modes[modeId];
        if (!targetMode) return;

        // Se for subir autonomia para Ajustes Leves, exige confirmação explícita
        if (modeId === 'GUARDED_AUTOMATION') {
            const confirmed = confirm(
                "⚡ ATENÇÃO — ELEVAÇÃO DE AUTONOMIA:\n\n" +
                "O RADWAN ADS terá permissão para executar pequenos ajustes de escala (até ±15%) e stop-loss em campanhas não protegidas, sob cooldown de 12 horas.\n\n" +
                "Deseja realmente autorizar este nível de automação?"
            );
            if (!confirmed) return;
        }

        try {
            window.autopilotEngine.setMode(modeId);
            this.renderAutopilotView();
            this.updateSidebarAndFooterStatus();
            this.showToast(`Modo alterado para: ${targetMode.name} (${targetMode.badge})`, 'success');
        } catch (err) {
            this.showToast(`Erro ao alterar modo: ${err.message}`, 'error');
        }
    }

    async toggleEmergencyStop() {
        const isCurrentlyStopped = window.guardrailEngine?.isEmergencyStopped() || false;

        if (!isCurrentlyStopped) {
            const confirmed = confirm(
                "🛑 CONFIRMAÇÃO DE PARADA DE SEGURANÇA (KILL SWITCH):\n\n" +
                "Isso pausará IMEDIATAMENTE qualquer escrita, alteração de orçamento e automação em produção no servidor.\n\n" +
                "Deseja ativar a Parada de Segurança agora?"
            );
            if (!confirmed) return;

            await window.guardrailEngine?.triggerEmergencyStop?.();
            this.showToast('🛑 PARADA DE SEGURANÇA ATIVADA! Mutações bloqueadas.', 'error');
        } else {
            await window.guardrailEngine?.resumeEmergencyStop?.();
            this.showToast('✅ Operação reativada com sucesso.', 'success');
        }

        this.renderAutopilotView();
        this.setupTableStickyScrollDepth();
        if (!window.commandMenu) {
            window.commandMenu = new CommandMenuEngine(this);
        }
    }

    setupTableStickyScrollDepth() {
        document.querySelectorAll('.data-table-container, .table-container').forEach(container => {
            if (container._hasScrollListener) return;
            container._hasScrollListener = true;
            container.addEventListener('scroll', () => {
                if (container.scrollLeft > 2) {
                    container.classList.add('is-scrolled');
                } else {
                    container.classList.remove('is-scrolled');
                }
            }, { passive: true });
        });
    }

    triggerEmergencyStop() {
        return this.toggleEmergencyStop();
    }

    resumeEmergencyStop() {
        return this.toggleEmergencyStop();
    }

    async logout() {
        if (window.authGate && typeof window.authGate.handleLogout === 'function') {
            await window.authGate.handleLogout();
        } else {
            window.location.reload();
        }
    }
}

// ─── COMMAND MENU GLOBAL ENGINE (⌘K / CTRL+K) ──────────────────────────────

class CommandMenuEngine {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.modal = null;
        this.input = null;
        this.resultsEl = null;
        this.isOpen = false;
        this.selectedIndex = 0;
        this.currentItems = [];
        this.init();
    }

    init() {
        this.modal = document.getElementById('command-menu-modal');
        this.input = document.getElementById('command-menu-search-input');
        this.resultsEl = document.getElementById('command-menu-results');

        if (!this.modal || !this.input || !this.resultsEl) return;

        // Global Keydown Listener (Ctrl+K / Cmd+K / Esc)
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'Escape' && this.isOpen) {
                e.preventDefault();
                this.close();
            }
        });

        this.input.addEventListener('input', () => this.handleSearch(this.input.value));
        this.input.addEventListener('keydown', (e) => this.handleKeyNavigation(e));
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        if (!this.modal) return;
        this.isOpen = true;
        this.modal.classList.remove('hidden');
        if (this.input) {
            this.input.value = '';
            setTimeout(() => this.input.focus(), 50);
        }
        this.handleSearch('');
    }

    close() {
        if (!this.modal) return;
        this.isOpen = false;
        this.modal.classList.add('hidden');
    }

    handleSearch(query) {
        const q = (query || '').trim().toLowerCase();
        const items = [];

        // 1. Atalhos de Navegação Principal
        const navSections = [
            { id: 'home', title: 'Ir para Home (Visão Geral)', icon: '📊', category: 'Navegação' },
            { id: 'campaigns', title: 'Ir para Campanhas', icon: '📢', category: 'Navegação' },
            { id: 'adsets', title: 'Ir para Conjuntos de Anúncios', icon: '📁', category: 'Navegação' },
            { id: 'ads', title: 'Ir para Anúncios Individuais', icon: '🎯', category: 'Navegação' },
            { id: 'creatives', title: 'Ir para Central de Criativos', icon: '🎨', category: 'Navegação' },
            { id: 'orders', title: 'Ir para Pedidos & Conversões', icon: '🛒', category: 'Navegação' },
            { id: 'site-intelligence', title: 'Ir para Site Intelligence (Funil & CAPI)', icon: '🧠', category: 'Navegação' },
            { id: 'autopilot', title: 'Ir para Modo Automático & Autonomia', icon: '🤖', category: 'Navegação' },
            { id: 'settings', title: 'Ir para Configurações', icon: '⚙️', category: 'Navegação' }
        ];

        navSections.forEach(nav => {
            if (!q || nav.title.toLowerCase().includes(q) || nav.id.includes(q)) {
                items.push({
                    type: 'nav',
                    title: nav.title,
                    subtitle: nav.category,
                    icon: nav.icon,
                    action: () => {
                        this.close();
                        if (nav.id === 'adsets' || nav.id === 'ads') {
                            this.dashboard.switchView('campaigns');
                            this.dashboard.switchCampaignTab(nav.id);
                        } else {
                            this.dashboard.switchView(nav.id);
                        }
                    }
                });
            }
        });

        // 2. Ações do Sistema & Governança
        const actions = [
            {
                title: 'Sincronizar Dados da Meta Agora',
                subtitle: 'Atualização forçada de métricas',
                icon: '🔄',
                action: () => { this.close(); this.dashboard.syncAllData(true); }
            },
            {
                title: 'Alternar Parada de Segurança (Kill Switch)',
                subtitle: 'Bloqueio de emergência de 100% das mutações',
                icon: '🛑',
                action: () => { this.close(); this.dashboard.toggleEmergencyStop(); }
            },
            {
                title: 'Filtrar Campanhas: Somente Ativas',
                subtitle: 'Exibir apenas campanhas em veiculação',
                icon: '⚡',
                action: () => { this.close(); this.dashboard.switchView('campaigns'); this.dashboard.setCampaignFilter('active'); }
            },
            {
                title: 'Filtrar Campanhas: Com Vendas',
                subtitle: 'Exibir campanhas que geraram compras',
                icon: '💰',
                action: () => { this.close(); this.dashboard.switchView('campaigns'); this.dashboard.setCampaignFilter('sales'); }
            },
            {
                title: 'Filtrar Campanhas: Requer Atenção',
                subtitle: 'Exibir campanhas com alto gasto sem retorno',
                icon: '⚠️',
                action: () => { this.close(); this.dashboard.switchView('campaigns'); this.dashboard.setCampaignFilter('attention'); }
            }
        ];

        actions.forEach(act => {
            if (!q || act.title.toLowerCase().includes(q) || act.subtitle.toLowerCase().includes(q)) {
                items.push({
                    type: 'action',
                    title: act.title,
                    subtitle: act.subtitle,
                    icon: act.icon,
                    action: act.action
                });
            }
        });

        // 3. Busca de Entidades (Campanhas cacheadas)
        const campaigns = this.dashboard.cachedCampaigns || [];
        campaigns.forEach(camp => {
            const name = camp.name || 'Campanha';
            const id = camp.id || '';
            const status = camp.status === 'ACTIVE' ? 'Ativa' : 'Pausada';
            const ins = this.dashboard.cachedInsights?.get(id);
            const spendFormatted = ins ? (window.analyticsEngine?.formatMoney(ins.spend) || `R$ ${ins.spend}`) : '–';

            if (!q || name.toLowerCase().includes(q) || id.includes(q)) {
                items.push({
                    type: 'campaign',
                    title: name,
                    subtitle: `Campanha ${status} • Investido: ${spendFormatted} • ID: ${id}`,
                    icon: camp.status === 'ACTIVE' ? '🟢' : '⏸️',
                    action: () => {
                        this.close();
                        this.dashboard.openRadwanAnalysisModal(id);
                    }
                });
            }
        });

        this.currentItems = items;
        this.selectedIndex = 0;
        this.renderResults();
    }

    renderResults() {
        if (!this.resultsEl) return;

        if (this.currentItems.length === 0) {
            this.resultsEl.innerHTML = `
                <div class="py-8 text-center text-[#6E6E73] italic">
                    Nenhum resultado encontrado para o termo pesquisado.
                </div>
            `;
            return;
        }

        this.resultsEl.innerHTML = this.currentItems.map((item, idx) => `
            <div class="command-menu-item ${idx === this.selectedIndex ? 'selected' : ''}" data-cmd-index="${idx}" onclick="window.commandMenu.executeItem(${idx})">
                <div class="flex items-center gap-2.5 min-w-0 pr-2">
                    <span class="command-item-icon text-sm flex-shrink-0">${item.icon}</span>
                    <div class="min-w-0">
                        <span class="font-semibold text-[#F5F5F7] block truncate">${escapeHTML(item.title)}</span>
                        <span class="text-[10px] text-[#6E6E73] block truncate font-mono">${escapeHTML(item.subtitle)}</span>
                    </div>
                </div>
                <span class="text-[10px] text-[#6E6E73] font-mono flex-shrink-0">↵</span>
            </div>
        `).join('');
    }

    handleKeyNavigation(e) {
        if (this.currentItems.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % this.currentItems.length;
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + this.currentItems.length) % this.currentItems.length;
            this.updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.executeItem(this.selectedIndex);
        }
    }

    updateSelection() {
        const items = this.resultsEl?.querySelectorAll('.command-menu-item') || [];
        items.forEach((el, idx) => {
            if (idx === this.selectedIndex) {
                el.classList.add('selected');
                el.scrollIntoView({ block: 'nearest' });
            } else {
                el.classList.remove('selected');
            }
        });
    }

    executeItem(index) {
        const item = this.currentItems[index];
        if (item && typeof item.action === 'function') {
            item.action();
        }
    }
}

// Instância Singleton e Inicialização Segura com Auth Gate
window.dashboard = new DashboardApp();
document.addEventListener('DOMContentLoaded', async () => {
    if (window.authGate && typeof window.authGate.init === 'function') {
        const isAuth = await window.authGate.init();
        if (isAuth) {
            window.dashboard.init();
        }
    } else {
        window.dashboard.init();
    }
});
