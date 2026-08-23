// ==============================================================================
// GAMIFICATION & AI COACH ENGINE (DISCIPLINE & HEALTH-BASED)
// Zero Casino / No Spend Incentives • XP From Data Rigor & Profitability
// ==============================================================================

class GamificationEngine {
    constructor() {
        this.ranks = [
            { level: 1, title: 'Junior Performance Operator', minXP: 0 },
            { level: 2, title: 'Data-Driven Media Buyer', minXP: 300 },
            { level: 3, title: 'Tracking Specialist', minXP: 700 },
            { level: 4, title: 'Creative Strategist', minXP: 1200 },
            { level: 5, title: 'Senior Traffic Architect', minXP: 2000 },
            { level: 6, title: 'Growth Systems Master', minXP: 3200 },
            { level: 7, title: 'Institutional Performance Operator', minXP: 5000 }
        ];
    }

    calculateLevel(currentXP) {
        let currentRank = this.ranks[0];
        for (const rank of this.ranks) {
            if (currentXP >= rank.minXP) {
                currentRank = rank;
            } else {
                break;
            }
        }
        return currentRank;
    }

    generateMissions(state) {
        const isUnitVerified = state.unit_economics && state.unit_economics.verifiedByOperator;
        return [
            {
                id: 'M1',
                title: 'Validar Unit Economics Real',
                desc: 'Confirmar custos fiscais e de produto para desbloquear escala autônoma.',
                xp: 100,
                completed: !!isUnitVerified
            },
            {
                id: 'M2',
                title: 'Auditar Saúde de Tracking & Pixel',
                desc: 'Verificar se eventos de PageView, IC e Purchase estão sincronizados.',
                xp: 60,
                completed: true
            },
            {
                id: 'M3',
                title: 'Revisar Análise do AI Coach',
                desc: 'Inspecionar as 3 recomendações prioritárias de hoje.',
                xp: 40,
                completed: false
            }
        ];
    }

    generateAICoachAdvice({ campaigns, totalSpend, totalPurchases, targetCPA }) {
        const advices = [];

        if (campaigns.length === 0) {
            return {
                headline: 'Tudo pronto para iniciar a operação.',
                bulletPoints: [
                    'Nenhuma campanha ativa identificada no momento.',
                    'Configure suas campanhas na Meta para iniciar os diagnósticos autônomos.'
                ],
                priorityAction: 'Subir primeira campanha com criativo validado.'
            };
        }

        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;

        if (totalPurchases > 0 && avgCpa <= targetCPA * 0.85) {
            advices.push('A eficiência global da conta está excelente (CPA médio abaixo da meta).');
            advices.push('Considere escalar gradualmente as campanhas com selo WINNER em até +15%.');
        } else if (totalPurchases === 0 && totalSpend > targetCPA) {
            advices.push('Atenção: Gasto acumulado sem compras confirmadas hoje.');
            advices.push('Recomenda-se inspecionar a taxa de conversão da Landing Page e o checkout.');
        } else {
            advices.push('Operação estável. Acompanhe a taxa de passagem entre Cliques e Início de Checkout.');
        }

        return {
            headline: 'Diagnóstico do Gestor IA',
            bulletPoints: advices,
            priorityAction: 'Verificar fila de aprovações e manter campanhas saudáveis ativas.'
        };
    }

    generateWhatShouldIDoNow({ campaigns, opportunities, targetCPA }) {
        const topActions = [];

        if (opportunities && opportunities.length > 0) {
            opportunities.slice(0, 3).forEach((opp, i) => {
                topActions.push({
                    priority: i + 1,
                    action: opp.title,
                    reason: opp.reason,
                    impact: 'ALTO',
                    risk: 'BAIXO'
                });
            });
        }

        while (topActions.length < 3) {
            const nextIdx = topActions.length + 1;
            if (nextIdx === 1) {
                topActions.push({ priority: 1, action: 'Manter campanhas com ROAS > 3.0x em observação contínua', reason: 'Entrega estável', impact: 'MÉDIO', risk: 'BAIXO' });
            } else if (nextIdx === 2) {
                topActions.push({ priority: 2, action: 'Verificar integridade do Pixel CAPI no Tracking Health', reason: 'Zero perda de sinal', impact: 'ALTO', risk: 'BAIXO' });
            } else {
                topActions.push({ priority: 3, action: 'Preparar novas variações de hook para teste A/B no Lab', reason: 'Prevenção de fadiga futura', impact: 'MÉDIO', risk: 'BAIXO' });
            }
        }

        return topActions;
    }

    calculatePowerScore(insights, targetCPA) {
        if (!insights) return { score: 50, light: 'YELLOW', reason: 'Sem dados' };
        
        let score = 70;
        const spend = insights.spend || 0;
        const purchases = insights.purchases || 0;
        const cpa = insights.cpa;

        if (purchases >= 3 && cpa && cpa <= targetCPA * 0.85) {
            score = 95;
            return { score, light: 'GREEN', reason: 'Vencedora consistente com CPA excelente' };
        }
        if (purchases === 0 && spend > targetCPA) {
            score = 25;
            return { score, light: 'RED', reason: 'Alto gasto sem conversão (Stop-loss recomendado)' };
        }
        if (insights.frequency > 2.2) {
            score = 55;
            return { score, light: 'YELLOW', reason: 'Fadiga de criativo em formação' };
        }

        return { score, light: 'GREEN', reason: 'Desempenho estável' };
    }
}

module.exports = new GamificationEngine();
