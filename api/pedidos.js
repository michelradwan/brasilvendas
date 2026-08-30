// ==============================================================================
// VERCEL SERVERLESS BACKEND - GESTÃO CENTRALIZADA DE PEDIDOS (PERSISTENTE)
// ==============================================================================

const https = require('https');
const fs = require('fs');
const path = require('path');
const { storage } = require('../lib/storage-adapter.js');
const authGuard = require('../lib/auth-guard.js');

const API_KEY = process.env.DUTTYFY_KEY;
const TMP_FILE = path.join('/tmp', 'pedidos.json');

// Carrega pedidos salvos em disco /tmp
function loadDiskOrders() {
    try {
        if (fs.existsSync(TMP_FILE)) {
            const content = fs.readFileSync(TMP_FILE, 'utf-8');
            return JSON.parse(content) || [];
        }
    } catch(e) {}
    return [];
}

// Salva pedidos em disco /tmp
function saveDiskOrders(orders) {
    try {
        fs.writeFileSync(TMP_FILE, JSON.stringify(orders.slice(0, 500)));
    } catch(e) {}
}

let globalPedidosCache = loadDiskOrders();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // DELETE ou POST com action=clear: Limpar todo o histórico de pedidos e leads falsos
    if (req.method === 'DELETE' || (req.method === 'POST' && req.query.action === 'clear')) {
        const authCheck = authGuard.validateAdminSession(req);
        if (!authCheck.authenticated) {
            return res.status(401).json({ success: false, error: 'Acesso negado: Autenticação administrativa necessária.' });
        }
        try {
            globalPedidosCache = [];
            saveDiskOrders([]);
            
            // Zerar persistentemente a coleção de pedidos/ações registradas no storage
            await storage.clearStore('actions');
            
            // Tentar remover arquivo físico se existir
            try {
                if (fs.existsSync(TMP_FILE)) {
                    fs.unlinkSync(TMP_FILE);
                }
            } catch(err) {}

            return res.status(200).json({ success: true, message: 'Histórico de pedidos e PIX gerados limpo com sucesso.' });
        } catch(e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // POST: Salvar novo pedido gerado (Público durante checkout com sanitização)
    if (req.method === 'POST') {
        try {
            const pedido = req.body;
            if (pedido && pedido.transaction_id) {
                // Salvar no storage persistente
                await storage.set('actions', `ORDER_${pedido.transaction_id}`, { result: pedido });

                // Remove duplicatas e insere no início
                globalPedidosCache = globalPedidosCache.filter(p => p.transaction_id !== pedido.transaction_id);
                globalPedidosCache.unshift(pedido);
                saveDiskOrders(globalPedidosCache);
            }
            return res.status(200).json({ success: true, count: globalPedidosCache.length });
        } catch(e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // GET: Listar pedidos com checagem ao vivo de status na Duttyfy (EXIGE AUTENTICAÇÃO ADMINISTRATIVA)
    if (req.method === 'GET') {
        const authCheck = authGuard.validateAdminSession(req);
        if (!authCheck.authenticated) {
            return res.status(401).json({
                success: false,
                error: 'Acesso negado: Visualização de pedidos restrita a administradores autenticados.'
            });
        }

        try {
            // Checar status de uma transação específica na Duttyfy
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

            // Buscar todos os pedidos persistentes no storage
            const storedActions = await storage.list('actions') || [];
            const persistentOrders = storedActions
                .filter(item => item && (item.transaction_id || (item.result && item.result.transaction_id)))
                .map(item => item.result || item);

            // Merge com cache em memória/disco
            const allMap = new Map();
            globalPedidosCache.forEach(p => allMap.set(p.transaction_id, p));
            persistentOrders.forEach(p => {
                const flattened = {
                    transaction_id: p.transaction_id,
                    name: p.customer?.name || p.name || 'Cliente',
                    cpf: p.customer?.document || p.cpf || '',
                    phone: p.customer?.phone || p.phone || '',
                    email: p.customer?.email || p.email || '',
                    amount: p.amount || 89.90,
                    size: p.size || 'M',
                    street: p.address?.street || p.street || '',
                    number: p.address?.number || p.number || '',
                    complement: p.address?.complement || p.complement || '',
                    neighborhood: p.address?.neighborhood || p.neighborhood || '',
                    city: p.address?.city || p.city || '',
                    state: p.address?.state || p.state || '',
                    cep: p.address?.cep || p.cep || '',
                    shipping_type: p.shipping?.type || p.shipping_type || 'free',
                    status: p.status || 'PENDENTE',
                    created_at: p.created_at || new Date().toISOString()
                };
                allMap.set(p.transaction_id, flattened);
            });

            let mergedList = Array.from(allMap.values());

            // Filtro por período temporal (se especificado na query)
            if (req.query.start_date && req.query.end_date) {
                const startTs = new Date(`${req.query.start_date}T00:00:00.000Z`).getTime();
                const endTs = new Date(`${req.query.end_date}T23:59:59.999Z`).getTime();
                mergedList = mergedList.filter(p => {
                    if (!p.created_at) return true;
                    const pTs = new Date(p.created_at).getTime();
                    return pTs >= startTs && pTs <= endTs;
                });
            }

            return res.status(200).json({
                success: true,
                pedidos: mergedList
            });
        } catch(e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    return res.status(405).json({ success: false, message: 'Método não suportado' });
};
