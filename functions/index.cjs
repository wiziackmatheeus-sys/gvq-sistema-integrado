const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { criarServicoContas } = require('./contas.cjs');
initializeApp();
const auth = getAuth(), db = getFirestore();
// É a chave pública do app, sem credenciais administrativas no navegador.
const apiKey = defineString('AUTH_WEB_API_KEY', { default: 'AIzaSyAwxmAaWkFhlSxQhL8OidoKSjMkLGDgC5k' });
const servico = criarServicoContas({ auth, db, FieldValue, erro: (codigo, mensagem) => new HttpsError(codigo, mensagem),
    verificarSenha: async (email, password) => {
        const origem = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.FIREBASE_AUTH_EMULATOR_HOST
            ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`
            : 'https://identitytoolkit.googleapis.com';
        const resposta = await fetch(`${origem}/v1/accounts:signInWithPassword?key=${apiKey.value()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(15000)
        });
        if (!resposta.ok) throw new HttpsError('permission-denied', 'Senha atual inválida ou serviço de autenticação indisponível.');
        return (await resposta.json()).localId;
    }
});
for (const nome of ['criarConta','redefinirSenha','trocarSenhaInicial']) {
    exports[nome] = onCall({ region: 'southamerica-east1', maxInstances: 3, timeoutSeconds: 60 }, async request => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
        try {
            // Callables autenticam o token; esta verificação adicional rejeita sessões revogadas.
            const token = request.rawRequest.headers.authorization?.replace(/^Bearer /i, '');
            const identidade = await auth.verifyIdToken(token, true);
            if (identidade.uid !== request.auth.uid) throw new HttpsError('unauthenticated', 'Entre novamente na sua conta.');
            return await servico[nome](request.auth.uid, request.data);
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            if (String(error.code).startsWith('auth/')) throw new HttpsError('unauthenticated', 'Entre novamente na sua conta.');
            throw new HttpsError('internal', 'Não foi possível concluir. Tente novamente; se a senha já tiver mudado, solicite uma nova redefinição ao escritório.');
        }
    });
}
