// Confere as APIs realmente exportadas pela versão do CDN usada pelo aplicativo.
// Serviços remotos são bloqueados; somente um projeto fictício é inicializado.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cache = process.env.GVQ_FIREBASE_SDK_DIR || path.join(os.tmpdir(), 'gvq-sdk-smoke');
const imports = new Map();
for (const file of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, 'js', file), 'utf8');
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](https:\/\/www\.gstatic\.com\/firebasejs\/[^"']+)["']/g)) {
        const names = imports.get(match[2]) || new Set();
        match[1].split(',').forEach(n => names.add(n.trim().split(/\s+as\s+/)[0]));
        imports.set(match[2], names);
    }
}
fs.mkdirSync(cache, { recursive: true });
for (const url of imports.keys()) {
    const file = path.join(cache, new URL(url).pathname.split('/').slice(-2).join('-'));
    if (!fs.existsSync(file)) fs.writeFileSync(file, execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '40', url], { maxBuffer: 8 * 1024 * 1024 }));
}
const demoFirebase = `
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
export const app = initializeApp({apiKey:'demo-gvq-sdk-check',projectId:'demo-gvq-tests',appId:'demo-gvq-check',storageBucket:'demo-gvq-tests.appspot.com'});
export const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);
`;
(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.GVQ_CHROMIUM_PATH ? { executablePath: process.env.GVQ_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
    try {
        const context = await browser.newContext();
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (imports.has(url.href)) {
                const file = path.join(cache, url.pathname.split('/').slice(-2).join('-'));
                return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(file) });
            }
            if (url.hostname !== 'gvq.local') return route.abort();
            if (url.pathname === '/sdk-check.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>SDK check</title>' });
            if (url.pathname === '/js/firebase.js') return route.fulfill({ contentType: 'application/javascript', body: demoFirebase });
            const file = path.join(root, url.pathname);
            if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
        });
        const page = await context.newPage();
        await page.goto('https://gvq.local/sdk-check.html');
        const resultado = await page.evaluate(async referencias => {
            for (const [url, nomes] of referencias) {
                const modulo = await import(url);
                for (const nome of nomes) if (!(nome in modulo)) throw new Error(`${nome} não é exportado por ${url}`);
            }
            await import('/js/anexos.js');
            const { storage } = await import('/js/firebase.js');
            return { upload: storage.maxUploadRetryTime, operacao: storage.maxOperationRetryTime };
        }, [...imports].map(([url, nomes]) => [url, [...nomes]]));
        assert.deepEqual(resultado, { upload: 45000, operacao: 15000 });
        console.log('PASS: todas as importações existem no SDK real e os limites de Storage são aplicados.');
        for (const arquivo of ['pesador', 'painel', 'escritorio']) {
            const pagina = await context.newPage();
            const erros = [];
            pagina.on('pageerror', erro => erros.push(erro.message));
            await pagina.goto(`https://gvq.local/pages/${arquivo}.html`);
            await pagina.waitForURL('**/index.html');
            assert.deepEqual(erros, []);
            await pagina.close();
            console.log(`PASS: ${arquivo} inicializa com o SDK real e identifica sessão ausente.`);
        }
    } finally { await browser.close(); }
})().catch(erro => { console.error(erro); process.exitCode = 1; });
