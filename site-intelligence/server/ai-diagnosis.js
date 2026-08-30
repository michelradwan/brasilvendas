// ==============================================================================
// SITE INTELLIGENCE — RADWAN DIAGNOSIS ENGINE
// Diagnóstico determinístico e interpretativo baseado em evidências concretas
// ==============================================================================

class AIDiagnosisEngine {
    /**
     * Gera relatório estruturado de diagnóstico com nível de confiança estatística
     */
    generateDiagnosis(funnelData, frictionData, bottleneck, sessions = []) {
        const total = sessions.length;
        
        // Grau de Confiança Estatística (Sample Size)
        let confidenceRating = 'Baixa (Amostra reduzida)';
        let confidenceScore = Math.min(100, Math.round((total / 50) * 100));

        if (total >= 50) confidenceRating = 'Alta (Amostra consistente)';
        else if (total >= 20) confidenceRating = 'Média (Amostra moderada)';

        if (total === 0) {
            return {
                confidence_score: 0,
                confidence_rating: 'Aguardando tráfego',
                headline: 'Ainda não recebemos sessões neste período',
                bullets: [
                    'O rastreador do site está ativo e pronto para registrar acessos.',
                    'Assim que os visitantes navegarem na página, as métricas e o funil serão calculados automaticamente.'
                ],
                recommended_action: 'Aguardar entrada de tráfego do site ou anúncios.'
            };
        }

        const convRate = funnelData.summary?.overall_conversion_rate || 0;

        if (total < 10) {
            return {
                confidence_score: Math.round((total / 10) * 35),
                confidence_rating: 'Coletando dados iniciais',
                headline: `Coletando dados iniciais (${total} ${total === 1 ? 'sessão' : 'sessões'})`,
                bullets: [
                    `Taxa de conversão preliminar: ${convRate}%.`,
                    `Visitantes que chegaram ao checkout: ${funnelData.steps?.[1]?.count || 0}.`,
                    'O diagnóstico de gargalos atinge precisão estatística a partir de 10 sessões consolidadas.'
                ],
                recommended_action: 'Acompanhar a chegada de novos visitantes.'
            };
        }

        const bullets = [];
        let headline = 'Desempenho Geral do Site Dentro da Normalidade';
        let action = 'Manter monitoramento contínuo das sessões.';

        // 1. Evidências de Funil
        bullets.push(`Taxa de conversão de visitante em comprador: ${convRate}%.`);

        // 2. Diagnóstico por Gargalo Principal
        switch (bottleneck.id) {
            case 'LANDING_PAGE_DROP':
                headline = 'Vazamento na Etapa Inicial da Landing Page';
                bullets.push(`Queda de ${bottleneck.drop_rate}% dos visitantes antes de abrir o formulário.`);
                bullets.push('Evidência: O público navega pela página, mas não avança para o botão de compra.');
                action = 'Testar variação na oferta principal e destacar o botão de compra.';
                break;

            case 'CHECKOUT_FORM_FRICTION':
                headline = 'Atrito no Preenchimento de Dados / Frete';
                bullets.push(`Queda de ${bottleneck.drop_rate}% entre o início do checkout e a geração do PIX.`);
                if (frictionData.summary?.total_rage_clicks > 0) {
                    bullets.push(`Detectados ${frictionData.summary.total_rage_clicks} cliques repetidos em campos do formulário.`);
                }
                action = 'Verificar se algum campo de CEP/endereço está gerando dúvida ou validação excessiva.';
                break;

            case 'PIX_NON_PAYMENT':
                headline = 'Gargalo no Fechamento do PIX Gerado';
                bullets.push(`${bottleneck.drop_rate}% dos códigos PIX gerados ainda não foram pagos.`);
                bullets.push('Evidência: O comprador gerou o código, mas não concluiu o pagamento no aplicativo do banco.');
                action = 'Utilizar a recuperação ativa via WhatsApp e reforçar o botão "Copiar Código PIX".';
                break;

            case 'UI_RAGE_CLICKS':
                headline = 'Cliques de Frustração Detectados na Interface';
                bullets.push(`Registrados ${frictionData.summary?.total_rage_clicks} cliques repetidos de frustração.`);
                if (frictionData.top_rage_elements?.[0]) {
                    bullets.push(`Elemento com maior atrito: "${frictionData.top_rage_elements[0].element}".`);
                }
                action = 'Revisar responsividade e cliques em áreas que parecem botões mas não são interativas.';
                break;

            case 'HEALTHY_FLOW':
                headline = 'Fluxo de Conversão Estável e Saudável';
                bullets.push('Taxas de passagem entre etapas operando dentro dos parâmetros de normalidade.');
                action = 'Escalar tráfego mantendo monitoramento contínuo.';
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
