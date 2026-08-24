// ==============================================================================
// SITE INTELLIGENCE — AI DIAGNOSIS ENGINE
// Diagnóstico interpretativo baseado em evidências concretas (Sem Texto Falso)
// ==============================================================================

class AIDiagnosisEngine {
    /**
     * Gera relatório estruturado de diagnóstico com nível de confiança
     */
    generateDiagnosis(funnelData, frictionData, bottleneck, sessions = []) {
        const total = sessions.length;
        
        // Grau de Confiança Estatística (Sample Size)
        let confidenceRating = 'Baixa (Amostra reduzida)';
        let confidenceScore = Math.min(100, Math.round((total / 50) * 100));

        if (total >= 50) confidenceRating = 'Alta (Amostra consistente)';
        else if (total >= 20) confidenceRating = 'Média (Amostra inicial)';

        if (total === 0) {
            return {
                confidence_score: 0,
                confidence_rating: 'Zero (Sem dados)',
                headline: 'Aguardando Coleta de Dados',
                bullets: [
                    'Nenhuma sessão registrada até o momento.',
                    'Insira o script do Site Intelligence no checkout para ativar a análise.'
                ],
                recommended_action: 'Aguardar tráfego.'
            };
        }

        const bullets = [];
        let headline = 'Desempenho Geral do Site Dentro da Normalidade';
        let action = 'Manter monitoramento continuo das sessões.';

        // 1. Evidências de Funil
        const convRate = funnelData.summary?.overall_conversion_rate || 0;
        bullets.push(`Taxa de conversão atual de visitante em comprador: ${convRate}%.`);

        // 2. Diagnóstico por Gargalo Principal
        switch (bottleneck.id) {
            case 'LANDING_PAGE_DROP':
                headline = 'Vazamento Crítico na Etapa Inicial (Landing Page)';
                bullets.push(`Queda de ${bottleneck.drop_rate}% dos visitantes antes de abrir o formulário.`);
                bullets.push('Evidência: O público não está engajando com o CTA principal ou oferta inicial.');
                action = 'Testar variação na oferta principal e clareza do botão de compra.';
                break;

            case 'CHECKOUT_FORM_FRICTION':
                headline = 'Atrito Significativo no Formulário de Dados/Frete';
                bullets.push(`Queda de ${bottleneck.drop_rate}% entre início do checkout e geração do PIX.`);
                if (frictionData.summary?.total_rage_clicks > 0) {
                    bullets.push(`Detectados ${frictionData.summary.total_rage_clicks} rage clicks em campos do formulário.`);
                }
                action = 'Simplificar formulário de cadastro e verificar validação de campos.';
                break;

            case 'PIX_NON_PAYMENT':
                headline = 'Gargalo Crítico no Fechamento do PIX';
                bullets.push(`${bottleneck.drop_rate}% dos códigos PIX gerados não são pagos.`);
                bullets.push('Evidência: O comprador chega até o final, mas não conclui a transferência.');
                action = 'Reforçar urgência na tela do PIX e adicionar botão "Copiar Código" em destaque.';
                break;

            case 'UI_RAGE_CLICKS':
                headline = 'Frustração do Usuário com Elementos Visuais (Rage Click)';
                bullets.push(`Registrados ${frictionData.summary?.total_rage_clicks} pontos de rage click.`);
                if (frictionData.top_rage_elements?.[0]) {
                    bullets.push(`Elemento com maior atrito: "${frictionData.top_rage_elements[0].element}".`);
                }
                action = 'Corrigir elementos que parecem clicáveis mas não respondem.';
                break;
        }

        return {
            confidence_score: confidenceScore,
            confidence_rating: confidenceRating,
            headline: headline,
            bullets: bullets,
            recommended_action: action
        };
    }
}

module.exports = new AIDiagnosisEngine();
