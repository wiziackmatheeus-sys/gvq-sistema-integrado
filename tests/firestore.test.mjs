import { before, after, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, runTransaction, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
let env;
const user = (nome, perfil, aprovado = true) => ({ nome, perfil, aprovado, login: nome.toLowerCase() });
const pesagem = () => ({ estado: 'SP', cidade: 'Barretos', fazendaDestino: 'Fazenda', cidadeDestino: 'Ibitinga', ufDestino: 'SP', pecuarista: 'João', dataCompra: '2026-10-19', dataPagamento: '', cabecas: '2', pesoTotal: '650.50', sexo: 'Macho', raca: 'Nelore', pesosIndividuais: [300, 350.5], observacoes: '', anexos: [], compradorUid: 'buyer1', comprador: 'Ana', pesadorUid: 'weigher1', pesador: 'Paulo', status: 'aguardando_comprador', timestamp: serverTimestamp() });
const financeiro = () => ({ ...pesagem(), precoUnitario: '300', unidadePreco: 'Por Arroba', valorTotalGado: 'R$ 6.505,00', tipoComissao: 'Nenhuma', valorComissao: '', totalComissao: '', corretor: '', pesagemId: 'p1', status: 'enviado_escritorio', validadoEm: serverTimestamp() });
const db = uid => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gvq-tests', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
        const d = context.firestore();
        for (const [id, dados] of Object.entries({ buyer1: user('Ana', 'comprador'), buyer2: user('Bruno', 'comprador'), weigher1: user('Paulo', 'pesador'), weigher2: user('Pedro', 'pesador'), office1: user('Olivia', 'escritorio'), pending: user('Pendente', 'escritorio', false) })) await setDoc(doc(d, 'usuarios', id), dados);
        await setDoc(doc(d, 'pesagens', 'p1'), pesagem());
        await setDoc(doc(d, 'romaneios', 'legacy'), { comprador: 'Ana', valorTotalGado: 'R$ 100,00' });
        await setDoc(doc(d, 'romaneios', 'other'), { compradorUid: 'buyer2', valorTotalGado: 'R$ 200,00' });
        await setDoc(doc(d, 'pecuaristas', 'pec1'), { nome: 'João' });
    });
});
test('pesador lê só suas pesagens, sem ler compras financeiras por ID ou consulta', async () => {
    const d = db('weigher1');
    await assertSucceeds(getDoc(doc(d, 'pesagens', 'p1')));
    await assertSucceeds(getDocs(query(collection(d, 'pesagens'), where('pesadorUid', '==', 'weigher1'))));
    await assertFails(getDoc(doc(db('weigher2'), 'pesagens', 'p1')));
    await assertFails(getDoc(doc(d, 'romaneios', 'legacy')));
    await assertFails(getDoc(doc(d, 'romaneios', 'other')));
    await assertFails(getDocs(collection(d, 'romaneios')));
});
test('pesador não pode incluir preço/comissão nem falsificar autoria e destinatário', async () => {
    const d = db('weigher1');
    await assertSucceeds(setDoc(doc(d, 'pesagens', 'novo'), pesagem()));
    for (const alteracao of [{ precoUnitario: '1' }, { valorTotalGado: '10' }, { corretor: 'X' }, { pesadorUid: 'weigher2' }, { compradorUid: 'office1' }, { comprador: 'Outro' }, { status: 'enviado_escritorio' }]) await assertFails(setDoc(doc(d, 'pesagens', 'forjada'), { ...pesagem(), ...alteracao }));
    await assertFails(setDoc(doc(d, 'romaneios', 'p1'), financeiro()));
});
test('comprador acessa somente a própria fila e o próprio histórico financeiro', async () => {
    await assertSucceeds(getDocs(query(collection(db('buyer1'), 'pesagens'), where('compradorUid', '==', 'buyer1'))));
    await assertFails(getDoc(doc(db('buyer2'), 'pesagens', 'p1')));
    await assertFails(getDoc(doc(db('buyer1'), 'romaneios', 'other')));
    await assertSucceeds(getDocs(query(collection(db('buyer1'), 'romaneios'), where('compradorUid', '==', 'buyer1'))));
});
test('escritório não lê pesagem pendente; conta pendente e anônimo não leem dados', async () => {
    await assertFails(getDoc(doc(db('office1'), 'pesagens', 'p1')));
    await assertSucceeds(getDoc(doc(db('office1'), 'romaneios', 'legacy')));
    await assertFails(getDoc(doc(db('pending'), 'romaneios', 'legacy')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'romaneios', 'legacy')));
});
test('encaminhamento exige comprador responsável e gravação atômica das duas etapas', async () => {
    const d = db('buyer1');
    await assertFails(setDoc(doc(d, 'romaneios', 'p1'), financeiro()));
    await assertFails(updateDoc(doc(d, 'pesagens', 'p1'), { status: 'enviado_escritorio', validadoEm: serverTimestamp() }));
    const outro = db('buyer2'); const b2 = writeBatch(outro);
    b2.set(doc(outro, 'romaneios', 'p1'), { ...financeiro(), compradorUid: 'buyer2', comprador: 'Bruno' });
    b2.update(doc(outro, 'pesagens', 'p1'), { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
    await assertFails(b2.commit());
    const b = writeBatch(d);
    b.set(doc(d, 'romaneios', 'p1'), financeiro());
    b.update(doc(d, 'pesagens', 'p1'), { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(db('office1'), 'romaneios', 'p1')));
    await assertFails(getDoc(doc(db('weigher1'), 'romaneios', 'p1')));
    await assertSucceeds(getDoc(doc(db('weigher1'), 'pesagens', 'p1')));
    // Mesmo ID não pode ser validado duas vezes, e o vínculo não pode ser alterado.
    await assertFails(setDoc(doc(d, 'romaneios', 'p1'), financeiro()));
    await assertFails(updateDoc(doc(d, 'pesagens', 'p1'), { compradorUid: 'buyer2' }));
});
test('diretório de compradores requer login e filtra por função e aprovação', async () => {
    const q = d => query(collection(d, 'usuarios'), where('perfil', '==', 'comprador'), where('aprovado', '==', true));
    await assertSucceeds(getDocs(q(db('weigher1'))));
    await assertFails(getDocs(collection(db('weigher1'), 'usuarios')));
    await assertFails(getDocs(q(env.unauthenticatedContext().firestore())));
});
test('cadastro permite pesador, mantém aprovação do escritório e impede autoelevação posterior', async () => {
    const d = db('new-user');
    await assertSucceeds(setDoc(doc(d, 'usuarios', 'new-user'), user('Novo', 'pesador')));
    await assertFails(updateDoc(doc(d, 'usuarios', 'new-user'), { perfil: 'escritorio', aprovado: true }));
    await assertFails(setDoc(doc(db('forged'), 'usuarios', 'forged'), user('Falso', 'escritorio')));
    await assertSucceeds(setDoc(doc(db('new-office'), 'usuarios', 'new-office'), user('Novo escritório', 'escritorio', false)));
});

test('transação usada pelo aplicativo funciona com regras ativas', async () => {
    const d = db('buyer1');
    await assertSucceeds(runTransaction(d, async transaction => {
        const origem = doc(d, 'pesagens', 'p1');
        const snap = await transaction.get(origem);
        if (snap.data().status !== 'aguardando_comprador') throw new Error('Já validada');
        transaction.set(doc(d, 'romaneios', 'p1'), financeiro());
        transaction.update(origem, { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
    }));
    await assertSucceeds(getDoc(doc(db('office1'), 'romaneios', 'p1')));
    await assertFails(getDoc(doc(db('weigher1'), 'romaneios', 'p1')));
});
