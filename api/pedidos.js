// ==============================================================================
// VERCEL SERVERLESS BACKEND - GESTÃO CENTRALIZADA DE PEDIDOS (ADMIN & LIVE SYNC)
// ==============================================================================

const https = require('https');

const API_KEY = process.env.DUTTYFY_KEY || 'b8ae99391cf645b2af25b66eef4b99d3';

// Armazenamento em memória / cache compartilhado da instância serverless
let globalPedidosCache = [];

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST: Salvar novo pedido gerado
    if (req.method === 'POST') {
        try {
            const pedido = req.body;
            if (pedido && pedido.transaction_id) {
                // Remove duplicatas e insere no início
                globalPedidosCache = globalPedidosCache.filter(p => p.transaction_id !== pedido.transaction_id);
                globalPedidosCache.unshift(pedido);
                if (globalPedidosCache.length > 500) globalPedidosCache.pop();
            }
            return res.status(200).json({ success: true, count: globalPedidosCache.length });
        } catch(e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // GET: Listar pedidos com checagem ao vivo de status na Duttyfy
    if (req.method === 'GET') {
        try {
            // Checar status das transações pendentes na Duttyfy
            const txToCheck = req.query.check_tx;
            if (txToCheck) {
                const checkUrl = `https://www.links-pagamentos.online/api-pix/status/${encodeURIComponent(txToCheck)}`;
                const parsed = new URL(checkUrl);

                const checkPromise = new Promise((resolve) => {
                    const apiReq = https.request({
                        hostname: parsed.hostname,
                        path: parsed.pathname + parsed.search,
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${API_KEY}`,
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Serverless Admin)'
                        }
                    }, (apiRes) => {
                        let data = '';
                        apiRes.on('data', chunk => data += chunk);
                        apiRes.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (e) {
                                resolve({ status: 'pending' });
                            }
                        });
                    });

                    apiReq.on('error', () => resolve({ status: 'pending' }));
                    apiReq.end();
                });

                const statusData = await checkPromise;
                return res.status(200).json({
                    success: true,
                    transaction_id: txToCheck,
                    status: statusData.status || 'pending',
                    raw: statusData
                });
            }

            return res.status(200).json({
                success: true,
                pedidos: globalPedidosCache
            });
        } catch(e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    return res.status(405).json({ success: false, message: 'Método não suportado' });
};
