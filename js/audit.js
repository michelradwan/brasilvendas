// ==============================================================================
// AUDIT ENGINE — STRUCTURED CHANGELOG & TIMELINE FEED
// ==============================================================================

class AuditEngine {
    constructor() {
        this.logs = [];
        this.maxRetention = 100;
        this.loadLogs();
    }

    loadLogs() {
        try {
            const saved = localStorage.getItem('meta_audit_logs');
            if (saved) {
                this.logs = JSON.parse(saved);
            }
        } catch(e){}
    }

    saveLogs() {
        localStorage.setItem('meta_audit_logs', JSON.stringify(this.logs.slice(0, this.maxRetention)));
    }

    logAction(entry) {
        const fullEntry = {
            id: `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            formattedTime: new Date().toLocaleTimeString('pt-BR'),
            formattedDate: new Date().toLocaleDateString('pt-BR'),
            action: entry.action || 'GENERIC_ACTION',
            objectId: entry.objectId || 'N/A',
            objectName: entry.objectName || 'Conta / Campanha',
            before: entry.before || '—',
            after: entry.after || '—',
            reason: entry.reason || 'Operação realizada com sucesso.',
            risk: entry.risk || 'LOW',
            verification: entry.verification || 'SUCCESS'
        };

        this.logs.unshift(fullEntry);
        this.saveLogs();
        
        // Disparar evento customizado para atualizar UI instantaneamente se houver listener
        window.dispatchEvent(new CustomEvent('audit_log_added', { detail: fullEntry }));

        return fullEntry;
    }

    getLogs(filterAction = null) {
        if (!filterAction) return this.logs;
        return this.logs.filter(l => l.action === filterAction);
    }

    // Exportação em Formato CSV
    exportCSV() {
        if (this.logs.length === 0) {
            alert('Nenhum log registrado para exportação.');
            return;
        }

        const headers = ['ID', 'Data', 'Hora', 'Acao', 'Objeto ID', 'Nome Objeto', 'Antes', 'Depois', 'Motivo', 'Risco', 'Verificacao'];
        const rows = this.logs.map(l => [
            l.id,
            l.formattedDate,
            l.formattedTime,
            `"${l.action}"`,
            `"${l.objectId}"`,
            `"${(l.objectName || '').replace(/"/g, '""')}"`,
            `"${l.before}"`,
            `"${l.after}"`,
            `"${(l.reason || '').replace(/"/g, '""')}"`,
            l.risk,
            l.verification
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meta_ads_audit_log_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Exportação em Formato JSON
    exportJSON() {
        if (this.logs.length === 0) {
            alert('Nenhum log registrado para exportação.');
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.logs, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `meta_ads_audit_log_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }
}

// Instância Singleton
window.auditEngine = new AuditEngine();
