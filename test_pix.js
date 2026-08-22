const https = require('https');

const url = 'https://www.links-pagamentos.online/api-pix/Akc4K4Bs4Q9sBfbGv3Kuh-9i39GvsmiE2IjP1IuCrdIlrDHCdCHF3UQ7zMlW-QmQa7KAfnDqL6QDvKX0kG2AHg';
const apiKey = 'b8ae99391cf645b2af25b66eef4b99d3';

function gerarCpfValido() {
    let n = [];
    for(let i=0; i<9; i++) n.push(Math.floor(Math.random()*10));
    let d1 = n.reduce((total, number, index) => total + (number * (10 - index)), 0);
    d1 = 11 - (d1 % 11);
    if (d1 >= 10) d1 = 0;
    n.push(d1);
    let d2 = n.reduce((total, number, index) => total + (number * (11 - index)), 0);
    d2 = 11 - (d2 % 11);
    if (d2 >= 10) d2 = 0;
    n.push(d2);
    return n.join('');
}

function testar(amount) {
    const payload = JSON.stringify({
        paymentMethod: 'PIX',
        customer: {
            name: 'Cliente Teste ' + amount,
            document: gerarCpfValido(),
            email: 'cliente' + amount + '@gmail.com',
            phone: '11987654321'
        },
        item: {
            title: 'Kit Patriota 2026',
            price: amount,
            quantity: 1
        },
        amount: amount
    });

    const parsed = new URL(url);

    const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'Mozilla/5.0'
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('TEST AMOUNT:', amount, '-> STATUS:', res.statusCode, 'BODY:', data);
        });
    });

    req.on('error', (e) => {
        console.error('ERROR:', e.message);
    });

    req.write(payload);
    req.end();
}

testar(8990);
testar(9989);
