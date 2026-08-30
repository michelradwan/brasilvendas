const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3333;
const ROOT = path.resolve(__dirname, '..');

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-suite-admin-secret-2026';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-suite-session-secret-2026';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let reqPath = parsedUrl.pathname;

    // Roteamento de API Serverless Local
    if (reqPath.startsWith('/api/')) {
        const apiName = reqPath.replace('/api/', '').replace('.js', '');
        const apiFile = path.join(ROOT, 'api', `${apiName}.js`);

        if (fs.existsSync(apiFile)) {
            let bodyData = '';
            req.on('data', chunk => { bodyData += chunk; });
            req.on('end', async () => {
                let parsedBody = {};
                try {
                    parsedBody = bodyData ? JSON.parse(bodyData) : {};
                } catch(e) {
                    parsedBody = bodyData;
                }

                const mockReq = {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    query: parsedUrl.query,
                    body: parsedBody
                };

                const mockRes = {
                    statusCode: 200,
                    headers: {},
                    setHeader(k, v) {
                        const lk = k.toLowerCase();
                        if (lk === 'set-cookie') {
                            if (!this.headers['Set-Cookie']) this.headers['Set-Cookie'] = [];
                            if (Array.isArray(v)) this.headers['Set-Cookie'].push(...v);
                            else this.headers['Set-Cookie'].push(v);
                        } else {
                            this.headers[k] = v;
                        }
                    },
                    status(code) { this.statusCode = code; return this; },
                    json(data) {
                        this.headers['Content-Type'] = 'application/json; charset=utf-8';
                        res.writeHead(this.statusCode, this.headers);
                        res.end(JSON.stringify(data));
                    },
                    end(data) {
                        res.writeHead(this.statusCode, this.headers);
                        res.end(data);
                    }
                };

                try {
                    delete require.cache[require.resolve(apiFile)];
                    const handler = require(apiFile);
                    await handler(mockReq, mockRes);
                } catch (err) {
                    console.error(`[API Error in ${apiName}]`, err);
                    mockRes.status(500).json({ success: false, error: err.message });
                }
            });
            return;
        }
    }

    if (reqPath === '/' || reqPath === '/admin-ads') reqPath = '/admin-ads.html';

    const filePath = path.join(ROOT, reqPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Local test server running at http://localhost:${PORT}/admin-ads.html`);
});
