import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';
const { criarServicoContas } = createRequire(import.meta.url)('../functions/contas.cjs');
const projeto = 'demo-gvq-tests';
let app, auth, db, funcoes;
const authUrl = () => `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=teste`;
async function entrar(login, senha) {
    const r = await fetch(authUrl(), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:`${login}@gvq.com.br`,password:senha,returnSecureToken:true}) });
    return { ok:r.ok, ...(await r.json()) };
}
async function chamar(nome,token,dados) {
    try {
        let autenticado;
        if (token) { const validado = await auth.verifyIdToken(token); autenticado = {uid:validado.uid,token:validado}; }
        return {result:await funcoes[nome].run({auth:autenticado,data:dados,rawRequest:{headers:{authorization:token ? 'Bearer ' + token : undefined}}})};
    } catch (error) { return {error:{status:String(error.code || 'internal').toUpperCase().replaceAll('-','_')}}; }
}
before(async () => {
    assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST,'Somente emuladores');
    process.env.FUNCTIONS_EMULATOR = 'true'; process.env.AUTH_WEB_API_KEY = 'teste';
    funcoes = createRequire(import.meta.url)('../functions/index.cjs');
    app = initializeApp({ projectId:projeto },'testes-contas'); auth = getAuth(app); db = getFirestore(app);
});
after(async () => { await deleteApp(app); });
beforeEach(async () => {
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projeto}/accounts`,{ method:'DELETE' });
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projeto}/databases/(default)/documents`,{ method:'DELETE' });
    for (const [uid,nome,perfil,extras] of [['office','Olivia','escritorio',{}],['buyer','Ana','originador',{}],['weigher','Paulo','pesador',{compradorUid:'buyer',comprador:'Ana'}],['pending','Pendente','escritorio',{aprovado:false}]]) {
        await auth.createUser({uid,email:`${uid}@gvq.com.br`,password:'Original-123'});
        await db.doc(`usuarios/${uid}`).set({nome,login:uid,perfil,aprovado:true,...extras});
    }
    await db.doc('pesagens/historico').set({pesadorUid:'weigher',compradorUid:'buyer',revisao:1});
    await db.doc('romaneios/historico').set({pesadorUid:'weigher',compradorUid:'buyer',valorTotalGado:'R$ 100,00'});
});
test('funções recusam anônimos, originadores e escritório pendente',async () => {
    assert.ok((await chamar('criarConta',null,{})).error);
    for(const login of ['buyer','pending']) {
        const token = (await entrar(login,'Original-123')).idToken;
        assert.equal((await chamar('criarConta',token,{nome:'Novo Pesador',login:'novo.pesador',perfil:'pesador',compradorUid:'buyer'})).error.status,'PERMISSION_DENIED');
    }
});
test('escritório cria pesador vinculado com senha individual, sem mudar sua própria conta',async () => {
    const token=(await entrar('office','Original-123')).idToken;
    const resultado=await chamar('criarConta',token,{nome:'Novo Pesador',login:'novo.pesador',perfil:'pesador',compradorUid:'buyer'});
    assert.ok(resultado.result,JSON.stringify(resultado)); const criado=resultado.result;
    assert.equal(criado.login,'novo.pesador'); assert.ok(criado.senhaTemporaria.length>=16);
    const perfil=(await db.doc(`usuarios/${criado.uid}`).get()).data();
    assert.equal(perfil.compradorUid,'buyer'); assert.equal(perfil.aprovado,true); assert.equal(perfil.trocaSenhaObrigatoria,true);
    assert.equal((await entrar(criado.login,criado.senhaTemporaria)).localId,criado.uid);
    assert.equal((await entrar('office','Original-123')).localId,'office');
    assert.ok(!JSON.stringify(perfil).includes(criado.senhaTemporaria));
    const segundo=await chamar('criarConta',token,{nome:'Novo Originador',login:'novo.originador',perfil:'originador'});
    assert.notEqual(segundo.result.senhaTemporaria,criado.senhaTemporaria);
    assert.equal((await chamar('criarConta',token,{nome:'Outro',login:'novo.pesador',perfil:'originador'})).error.status,'ALREADY_EXISTS');
    assert.equal((await chamar('criarConta',token,{nome:'Escritório',login:'admin.novo',perfil:'escritorio'})).error.status,'INVALID_ARGUMENT');
    assert.ok((await chamar('criarConta',token,{nome:'Sem vínculo',login:'sem.vinculo',perfil:'pesador',compradorUid:'office'})).error);
});
test('redefinição, primeiro acesso e troca preservam UID, vínculo e histórico',async () => {
    const officeToken=(await entrar('office','Original-123')).idToken;
    const tokenAntigo=(await entrar('weigher','Original-123')).idToken;
    const redefinido=(await chamar('redefinirSenha',officeToken,{uid:'weigher'})).result;
    assert.ok(redefinido);
    assert.equal((await entrar('weigher','Original-123')).ok,false);
    const temporario=await entrar('weigher',redefinido.senhaTemporaria); assert.equal(temporario.localId,'weigher');
    assert.equal((await db.doc('usuarios/weigher').get()).data().trocaSenhaObrigatoria,true);
    assert.ok((await chamar('trocarSenhaInicial',tokenAntigo,{senhaAtual:'Original-123',novaSenha:'Definitiva-456'})).error);
    assert.ok((await chamar('trocarSenhaInicial',temporario.idToken,{senhaAtual:redefinido.senhaTemporaria,novaSenha:redefinido.senhaTemporaria})).error);
    assert.ok((await chamar('trocarSenhaInicial',temporario.idToken,{senhaAtual:'errada',novaSenha:'Definitiva-456'})).error);
    const trocado=await chamar('trocarSenhaInicial',temporario.idToken,{senhaAtual:redefinido.senhaTemporaria,novaSenha:'Definitiva-456'});
    assert.ok(trocado.result,JSON.stringify(trocado));
    assert.equal((await entrar('weigher',redefinido.senhaTemporaria)).ok,false);
    const definitivo=await entrar('weigher','Definitiva-456'); assert.equal(definitivo.localId,'weigher');
    const perfil=(await db.doc('usuarios/weigher').get()).data(); assert.equal(perfil.trocaSenhaObrigatoria,false); assert.equal(perfil.compradorUid,'buyer');
    assert.ok(definitivo.idToken);
    assert.deepEqual((await db.doc('romaneios/historico').get()).data(),{pesadorUid:'weigher',compradorUid:'buyer',valorTotalGado:'R$ 100,00'});
    assert.equal((await db.doc('pesagens/historico').get()).data().revisao,1);
    const auditoria=(await db.collection('auditoriaContas').get()).docs.map(d=>d.data());
    assert.deepEqual(auditoria.map(a=>a.tipo).sort(),['redefinicao','troca_pelo_usuario']);
    assert.ok(!JSON.stringify(auditoria).includes(redefinido.senhaTemporaria));
    assert.ok((await chamar('redefinirSenha',officeToken,{uid:'office'})).error);
});
test('operações concorrentes são bloqueadas e falha no Auth mantém conta em troca obrigatória',async () => {
    const token=(await entrar('office','Original-123')).idToken;
    await db.doc('operacoesContas/weigher').set({operacao:'outra',expiraEm:Date.now()+60000});
    assert.equal((await chamar('redefinirSenha',token,{uid:'weigher'})).error.status,'ABORTED');
    await db.doc('operacoesContas/weigher').delete();
    const servico=criarServicoContas({auth:{getUser:uid=>auth.getUser(uid),updateUser:async()=>{throw new Error('Falha simulada');}},db,FieldValue,erro:(code,message)=>Object.assign(new Error(message),{code})});
    await assert.rejects(servico.redefinirSenha('office',{uid:'weigher'}));
    assert.equal((await db.doc('usuarios/weigher').get()).data().trocaSenhaObrigatoria,true);
    assert.equal((await db.doc('operacoesContas/weigher').get()).exists,false);
});
