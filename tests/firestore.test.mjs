import { before, after, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, writeBatch, serverTimestamp, runTransaction, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
let env;
export const user = (nome, perfil, aprovado = true, campos = {}) => ({ nome, perfil, aprovado, login: nome.toLowerCase(), ...campos });
export const pesagem = () => ({ estado: 'SP', cidade: 'Barretos', fazendaDestino: 'Fazenda', cidadeDestino: 'Ibitinga', ufDestino: 'SP', pecuarista: 'João', pecuaristaDocumento: '123', pecuaristaBanco: 'Banco', pecuaristaAgencia: '1', pecuaristaConta: '2', dataCompra: '2026-10-19', dataPagamento: '2026-10-23', cabecas: '2', pesoTotal: '650.50', pesoMedio: '325.25', tipoPesagem: 'individual', sexo: 'Macho', raca: 'F1 Angus', pesosIndividuais: [300, 350.5], observacoes: '', anexos: [], anexosLinks: [], anexosCaminhos: [], compradorUid: 'buyer1', comprador: 'Ana', pesadorUid: 'weigher1', pesador: 'Paulo', revisao: 1, status: 'aguardando_comprador', timestamp: serverTimestamp() });
export const financeiro = (revisao = 1) => ({ ...pesagem(), precoUnitario: '300', unidadePreco: 'Por Arroba', valorTotalGado: 'R$ 6.505,00', tipoComissao: 'Nenhuma', valorComissao: '0', totalComissao: 'R$ 0,00', corretor: 'Sem corretor', pesagemId: 'p1', revisaoValidada: revisao, status: 'enviado_escritorio', validadoEm: serverTimestamp() });
const db = uid => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gvq-tests', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
        const d = context.firestore();
        const usuarios = { buyer1: user('Ana', 'originador'), buyer2: user('Bruno', 'comprador'), weigher1: user('Paulo', 'pesador', true, { compradorUid: 'buyer1', comprador: 'Ana' }), weigher2: user('Pedro', 'pesador', true, { compradorUid: 'buyer2', comprador: 'Bruno' }), waiting: user('Pendente', 'pesador', false), office1: user('Olivia', 'escritorio'), pendingOffice: user('Pendente escritório', 'escritorio', false) };
        for (const [id, dados] of Object.entries(usuarios)) await setDoc(doc(d, 'usuarios', id), dados);
        await setDoc(doc(d, 'pesagens', 'p1'), pesagem());
        await setDoc(doc(d, 'romaneios', 'legacy'), { comprador: 'Ana', valorTotalGado: 'R$ 100,00' });
        await setDoc(doc(d, 'romaneios', 'other'), { compradorUid: 'buyer2', valorTotalGado: 'R$ 200,00' });
    });
});
async function validar(revisao = 1) {
    const d = db('buyer1');
    return runTransaction(d, async t => {
        const origem = doc(d, 'pesagens', 'p1'); await t.get(origem);
        t.set(doc(d, 'romaneios', 'p1'), financeiro(revisao));
        t.update(origem, { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
    });
}
function complemento(d, extras = {}, incluirFinanceiro = true) {
    const b = writeBatch(d);
    b.update(doc(d, 'pesagens', 'p1'), { anexos: ['GTA.pdf'], anexosLinks: [{ nomeArquivo: 'GTA.pdf', caminho: 'pesagens/p1/weigher1/f1', urlDownload: 'https://example.test/GTA.pdf' }], anexosCaminhos: ['pesagens/p1/weigher1/f1'], revisao: 2, status: 'aguardando_comprador', complementadoEm: serverTimestamp(), ...extras });
    if (incluirFinanceiro) b.update(doc(d, 'romaneios', 'p1'), { status: 'aguardando_revalidacao', revalidacaoSolicitadaEm: serverTimestamp() });
    return b.commit();
}
test('cadastro de pesador fica pendente e não permite autoaprovação nem escolha de originador', async () => {
    await assertSucceeds(setDoc(doc(db('new'), 'usuarios', 'new'), user('Novo', 'pesador', false)));
    await assertFails(setDoc(doc(db('bad'), 'usuarios', 'bad'), user('Falso', 'pesador', true)));
    await assertFails(updateDoc(doc(db('waiting'), 'usuarios', 'waiting'), { aprovado: true, compradorUid: 'buyer1' }));
    await assertFails(setDoc(doc(db('fake-office'), 'usuarios', 'fake-office'), user('Falso', 'escritorio', true)));
});
test('somente escritório aprovado pode vincular e aprovar um pesador', async () => {
    const alteracao = { aprovado: true, compradorUid: 'buyer1', comprador: 'Ana', aprovadoPor: 'office1', aprovadoEm: serverTimestamp() };
    await assertFails(updateDoc(doc(db('buyer1'), 'usuarios', 'waiting'), alteracao));
    await assertFails(updateDoc(doc(db('pendingOffice'), 'usuarios', 'waiting'), { ...alteracao, aprovadoPor: 'pendingOffice' }));
    await assertFails(updateDoc(doc(db('office1'), 'usuarios', 'waiting'), { ...alteracao, compradorUid: 'office1' }));
    await assertSucceeds(updateDoc(doc(db('office1'), 'usuarios', 'waiting'), alteracao));
    await assertFails(updateDoc(doc(db('office1'), 'usuarios', 'waiting'), { ...alteracao, perfil: 'originador' }));
});
test('pesador não lista originadores nem lê o perfil de outros usuários', async () => {
    const d = db('weigher1');
    await assertSucceeds(getDoc(doc(d, 'usuarios', 'weigher1')));
    await assertFails(getDoc(doc(d, 'usuarios', 'buyer1')));
    await assertFails(getDocs(collection(d, 'usuarios')));
    await assertFails(getDocs(query(collection(d, 'usuarios'), where('perfil', '==', 'originador'))));
    await assertSucceeds(getDocs(collection(db('office1'), 'usuarios')));
});
test('pesador envia somente para seu originador e somente após aprovação', async () => {
    await assertSucceeds(setDoc(doc(db('weigher1'), 'pesagens', 'novo'), pesagem()));
    await assertFails(setDoc(doc(db('weigher1'), 'pesagens', 'outro'), { ...pesagem(), compradorUid: 'buyer2', comprador: 'Bruno' }));
    await assertFails(setDoc(doc(db('waiting'), 'pesagens', 'novo'), { ...pesagem(), pesadorUid: 'waiting' }));
    await assertFails(setDoc(doc(db('weigher1'), 'pesagens', 'financeiro'), { ...pesagem(), precoUnitario: '100' }));
});
test('balanção sem pesos individuais é permitida; campos obrigatórios e média são verificados', async () => {
    const d = db('weigher1');
    await assertSucceeds(setDoc(doc(d, 'pesagens', 'balancao'), { ...pesagem(), tipoPesagem: 'balancao', pesosIndividuais: [] }));
    for (const campos of [{ dataPagamento: '' }, { pecuaristaConta: '' }, { cidadeDestino: '' }, { pesoMedio: '999' }, { cabecas: '2.5' }]) await assertFails(setDoc(doc(d, 'pesagens', 'invalida'), { ...pesagem(), ...campos }));
});
test('isolamento financeiro e operacional entre os perfis e entre usuários', async () => {
    await assertSucceeds(getDocs(query(collection(db('weigher1'), 'pesagens'), where('pesadorUid', '==', 'weigher1'))));
    await assertFails(getDoc(doc(db('weigher2'), 'pesagens', 'p1')));
    await assertFails(getDoc(doc(db('buyer2'), 'pesagens', 'p1')));
    await assertFails(getDoc(doc(db('weigher1'), 'romaneios', 'legacy')));
    await assertFails(getDoc(doc(db('buyer1'), 'romaneios', 'other')));
    await assertFails(getDoc(doc(db('office1'), 'pesagens', 'p1')));
    await assertSucceeds(getDoc(doc(db('office1'), 'romaneios', 'legacy')));
});
test('validação exige transação completa, originador correto e não aceita duplicação', async () => {
    await assertFails(setDoc(doc(db('buyer1'), 'romaneios', 'p1'), financeiro()));
    await assertFails(updateDoc(doc(db('buyer1'), 'pesagens', 'p1'), { status: 'enviado_escritorio', validadoEm: serverTimestamp() }));
    await assertSucceeds(validar());
    await assertSucceeds(getDoc(doc(db('office1'), 'romaneios', 'p1')));
    await assertFails(getDoc(doc(db('weigher1'), 'romaneios', 'p1')));
    await assertFails(validar());
});
test('complemento após aprovação reabre a revisão e altera só status no financeiro', async () => {
    await validar();
    await assertFails(complemento(db('weigher1'), {}, false));
    await assertFails(complemento(db('weigher2')));
    await assertSucceeds(complemento(db('weigher1')));
    await assertFails(getDoc(doc(db('weigher1'), 'romaneios', 'p1')));
    const antigo = await getDoc(doc(db('buyer1'), 'romaneios', 'p1'));
    if (antigo.data().status !== 'aguardando_revalidacao' || antigo.data().valorTotalGado !== 'R$ 6.505,00') throw new Error('Financeiro foi alterado pelo pesador');
    await assertFails(validar(1));
    await assertSucceeds(validar(2));
});
test('complemento não altera a pesagem original nem permite enviar valores ao originador', async () => {
    await assertFails(complemento(db('weigher1'), { pesoTotal: '999' }, false));
    await assertFails(complemento(db('weigher1'), { valorTotalGado: '10' }, false));
    await assertSucceeds(complemento(db('weigher1'), {}, false));
});

test('complementos sucessivos preservam os documentos de revisões anteriores', async () => {
    await validar();
    await complemento(db('weigher1'));
    const d = db('weigher1'); const p = (await getDoc(doc(d, 'pesagens', 'p1'))).data();
    const b = writeBatch(d);
    b.update(doc(d, 'pesagens', 'p1'), {
        anexos: [...p.anexos, 'NF.pdf'],
        anexosLinks: [...p.anexosLinks, { nomeArquivo: 'NF.pdf', caminho: 'pesagens/p1/weigher1/f2', urlDownload: 'https://example.test/NF.pdf' }],
        anexosCaminhos: [...p.anexosCaminhos, 'pesagens/p1/weigher1/f2'],
        revisao: 3, status: 'aguardando_comprador', complementadoEm: serverTimestamp()
    });
    b.update(doc(d, 'romaneios', 'p1'), { status: 'aguardando_revalidacao', revalidacaoSolicitadaEm: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertSucceeds(validar(3));
});
