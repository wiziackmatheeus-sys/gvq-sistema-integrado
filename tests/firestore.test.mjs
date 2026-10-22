import { reservarNumeroCompra, temNumeroCompra, executarNumeracao } from '../js/codigo-compra.js';
import { registrarAnexosTexto } from '../js/anexos-texto.js';
import { before, after, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, runTransaction, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
let env;
export const user = (nome, perfil, aprovado = true, campos = {}) => ({ nome, perfil, aprovado, login: nome.toLowerCase(), ...campos });
export const pesagem = () => ({ estado: 'SP', cidade: 'Barretos', fazendaDestino: 'Fazenda', cidadeDestino: 'Ibitinga', ufDestino: 'SP', pecuarista: 'João', pecuaristaDocumento: '123', pecuaristaBanco: 'Banco', pecuaristaAgencia: '1', pecuaristaConta: '2', dataCompra: '2026-10-19', dataPagamento: '2026-10-23', cabecas: '2', pesoTotal: '650.50', pesoMedio: '325.25', tipoPesagem: 'individual', sexo: 'Macho', raca: 'F1 Angus', pesosIndividuais: [300, 350.5], observacoes: '', anexos: [], anexosLinks: [], anexosCaminhos: [], compradorUid: 'buyer1', comprador: 'Ana', pesadorUid: 'weigher1', pesador: 'Paulo', revisao: 1, status: 'aguardando_comprador', timestamp: serverTimestamp() });
export const financeiro = (revisao = 1, evento = "validacao") => ({ ...pesagem(), precoUnitario: '300', unidadePreco: 'Por Arroba', valorTotalGado: 'R$ 6.505,00', tipoComissao: 'Nenhuma', valorComissao: '0', totalComissao: 'R$ 0,00', corretor: 'Sem corretor', pesagemId: 'p1', codigoCompra: 'OC-FAZENDA-202610-p1', numeroCompra: 1, revisaoValidada: revisao, etapaEscritorio: 'recebida', responsavelEscritorioUid: null, responsavelEscritorio: null, finalizadoPorUid: null, finalizadoPor: null, finalizadoEm: null, etapaAtualizadaPorUid: 'buyer1', etapaAtualizadaEm: serverTimestamp(), ultimoEventoEscritorio: evento, status: 'enviado_escritorio', validadoEm: serverTimestamp() });
const db = uid => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gvq-tests', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
        const d = context.firestore();
        const usuarios = { buyer1: user('Ana', 'originador'), buyer2: user('Bruno', 'comprador'), weigher1: user('Paulo', 'pesador', true, { compradorUid: 'buyer1', comprador: 'Ana' }), weigher2: user('Pedro', 'pesador', true, { compradorUid: 'buyer2', comprador: 'Bruno' }), waiting: user('Pendente', 'pesador', false), office1: user('Olivia', 'escritorio'), office2: user('Paula', 'escritorio'), pendingOffice: user('Pendente escritório', 'escritorio', false) };
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
        const evento = doc(collection(d, 'romaneios', 'p1', 'historicoEscritorio'));
        const anterior = revisao > 1 ? await t.get(doc(d, 'romaneios', 'p1')) : null;
        const numeroCompra = await reservarNumeroCompra(t, doc(d, 'contadores', 'compras'), anterior?.data(), 'p1');
        t.set(doc(d, 'romaneios', 'p1'), {...financeiro(revisao, evento.id), numeroCompra});
        t.set(evento, { tipo: 'validacao_originador', etapa: 'recebida', etapaAnterior: null, usuarioUid: 'buyer1', usuario: 'Ana', revisao, quando: serverTimestamp() });
        t.update(origem, { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
    });
}
function complemento(d, extras = {}, incluirFinanceiro = true) {
    const b = writeBatch(d);
    b.update(doc(d, 'pesagens', 'p1'), { anexos: ['GTA.pdf'], anexosLinks: [{ nomeArquivo: 'GTA.pdf', caminho: 'pesagens/p1/weigher1/f1', urlDownload: 'https://example.test/GTA.pdf' }], anexosCaminhos: ['pesagens/p1/weigher1/f1'], revisao: 2, status: 'aguardando_comprador', complementadoEm: serverTimestamp(), ...extras });
    if (incluirFinanceiro) b.update(doc(d, 'romaneios', 'p1'), { status: 'aguardando_revalidacao', revalidacaoSolicitadaEm: serverTimestamp() });
    return b.commit();
}
test('autocadastro permite somente o próprio perfil pendente com login correspondente ao Auth', async () => {
    for (const perfil of ['pesador','originador','escritorio']) {
        const uid = 'new-' + perfil;
        const d = env.authenticatedContext(uid, { email: `${uid}@gvq.com.br` }).firestore();
        const dados = { nome: 'Novo Usuário', login: uid, perfil, aprovado: false, criadoEm: serverTimestamp() };
        await assertFails(setDoc(doc(d, 'usuarios', uid), { ...dados, aprovado: true }));
        await assertFails(setDoc(doc(d, 'usuarios', uid), { ...dados, compradorUid: 'buyer1' }));
        await assertFails(setDoc(doc(d, 'usuarios', uid), { ...dados, aprovadoPor: 'office1' }));
        await assertFails(setDoc(doc(d, 'usuarios', uid), { ...dados, trocaSenhaObrigatoria: false }));
        await assertFails(setDoc(doc(d, 'usuarios', uid), { ...dados, login: 'outra.pessoa' }));
        await assertFails(setDoc(doc(d, 'usuarios', 'outra-pessoa'), dados));
        await assertSucceeds(setDoc(doc(d, 'usuarios', uid), dados));
        await assertFails(updateDoc(doc(d, 'usuarios', uid), { aprovado: true }));
        await assertFails(updateDoc(doc(d, 'usuarios', uid), { perfil: 'escritorio' }));
        await assertFails(getDocs(collection(d, 'usuarios')));
        await assertFails(getDoc(doc(d, 'romaneios', 'legacy')));
        await assertFails(getDoc(doc(d, 'pesagens', 'p1')));
        await assertFails(updateDoc(doc(d, 'usuarios', 'waiting'), { aprovado: true }));
    }
    const anonimo = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonimo, 'usuarios', 'anonimo'), { nome: 'Anonimo', login: 'anonimo', perfil: 'escritorio', aprovado: false, criadoEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('waiting'),'usuarios','waiting'),{aprovado:true,compradorUid:'buyer1'}));
    await assertFails(setDoc(doc(db('office1'),'usuarios','novo-office'),user('Novo','escritorio',true)));
});
test('escritório aprovado aprova todos os perfis; pendentes não aprovam a si mesmos ou terceiros', async () => {
    const alteracao = { aprovado: true, aprovadoPor: 'office1', aprovadoEm: serverTimestamp() };
    for (const perfil of ['originador', 'comprador', 'escritorio']) {
        const uid = 'pending-' + perfil;
        await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'usuarios', uid), user('Pendente', perfil, false)));
        await assertFails(updateDoc(doc(db(uid), 'usuarios', uid), { ...alteracao, aprovadoPor: uid }));
        await assertFails(updateDoc(doc(db('pendingOffice'), 'usuarios', uid), { ...alteracao, aprovadoPor: 'pendingOffice' }));
        await assertFails(updateDoc(doc(db('buyer1'), 'usuarios', uid), { ...alteracao, aprovadoPor: 'buyer1' }));
        await assertFails(updateDoc(doc(db('office1'), 'usuarios', uid), { ...alteracao, perfil: 'pesador' }));
        await assertFails(updateDoc(doc(db('office1'), 'usuarios', uid), { ...alteracao, compradorUid: 'buyer1' }));
        await assertFails(updateDoc(doc(db('office1'), 'usuarios', uid), { ...alteracao, aprovadoPor: uid }));
        await assertSucceeds(updateDoc(doc(db('office1'), 'usuarios', uid), alteracao));
        if (perfil === 'escritorio') await assertSucceeds(getDocs(collection(db(uid), 'usuarios')));
    }
    await assertFails(updateDoc(doc(db('office1'), 'usuarios', 'office1'), alteracao));
    await assertFails(updateDoc(doc(db('office1'), 'usuarios', 'waiting'), alteracao));
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
test('regras aceitam nomes em demonstração sem URL ou arquivo e preservam isolamento', async () => {
    const anexosLinks = registrarAnexosTexto([
        { arquivo: { name: 'documento.pdf' }, categoria: 'nota_fiscal' },
        { arquivo: { name: 'documento.pdf' }, categoria: 'ordem_embarque_checklist' }
    ], { uid: 'weigher1', pesagemId: 'demo' });
    await assertSucceeds(setDoc(doc(db('weigher1'), 'pesagens', 'demo'), {
        ...pesagem(), anexosLinks, anexos: anexosLinks.map(a => a.nomeArquivo), anexosCaminhos: anexosLinks.map(a => a.caminho)
    }));
    const recebido = await assertSucceeds(getDoc(doc(db('buyer1'), 'pesagens', 'demo')));
    if (recebido.data().anexosLinks.length !== 2 || recebido.data().anexosLinks.some(a => !a.somenteTexto || a.urlDownload)) throw new Error('Metadados de demonstração divergentes');
    await assertFails(getDoc(doc(db('buyer2'), 'pesagens', 'demo')));
    const complementoTexto = registrarAnexosTexto([{ arquivo: { name: 'GTA.pdf' }, categoria: 'gta' }], { uid: 'weigher1', pesagemId: 'p1' });
    await assertSucceeds(complemento(db('weigher1'), {
        anexos: ['GTA.pdf'], anexosLinks: complementoTexto, anexosCaminhos: complementoTexto.map(a => a.caminho)
    }, false));
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

async function etapa(uid, proxima, extras = {}, comHistorico = true) {
    const d = db(uid), referencia = doc(d, 'romaneios', 'p1');
    const atual = (await getDoc(doc(db('office1'), 'romaneios', 'p1'))).data();
    const anterior = atual.etapaEscritorio || 'recebida';
    const nome = uid === 'office1' ? 'Olivia' : uid === 'office2' ? 'Paula' : uid === 'buyer1' ? 'Ana' : 'Paulo';
    const evento = doc(collection(d, 'romaneios', 'p1', 'historicoEscritorio'));
    const campos = { etapaEscritorio: proxima, etapaAtualizadaEm: serverTimestamp(), etapaAtualizadaPorUid: uid, ultimoEventoEscritorio: evento.id };
    if (proxima === 'em_andamento') Object.assign(campos, { responsavelEscritorioUid: uid, responsavelEscritorio: nome, finalizadoPorUid: null, finalizadoPor: null, finalizadoEm: null });
    else Object.assign(campos, { finalizadoPorUid: uid, finalizadoPor: nome, finalizadoEm: serverTimestamp() });
    const b = writeBatch(d); b.update(referencia, { ...campos, ...extras });
    if (comHistorico) b.set(evento, { tipo: 'etapa_escritorio', etapa: proxima, etapaAnterior: anterior, usuarioUid: uid, usuario: nome, revisao: atual.revisaoValidada || 1, quando: serverTimestamp() });
    return b.commit();
}
test('recepção pelo originador registra Recebida e histórico somente legível pelo escritório', async () => {
    await assertSucceeds(validar());
    const p = (await getDoc(doc(db('office1'), 'romaneios', 'p1'))).data();
    if (p.etapaEscritorio !== 'recebida' || p.responsavelEscritorioUid !== null) throw new Error('Recepção incorreta');
    const historico = collection(db('office1'), 'romaneios', 'p1', 'historicoEscritorio');
    const eventos = await assertSucceeds(getDocs(historico));
    if (eventos.size !== 1) throw new Error('Evento inicial ausente');
    await assertFails(getDocs(collection(db('buyer1'), 'romaneios', 'p1', 'historicoEscritorio')));
    await assertFails(getDocs(collection(db('weigher1'), 'romaneios', 'p1', 'historicoEscritorio')));
});
test('escritório assume, finaliza e reabre com autoria e histórico imutável', async () => {
    await validar();
    await assertSucceeds(etapa('office1', 'em_andamento'));
    await assertSucceeds(etapa('office2', 'finalizada'));
    let p = (await getDoc(doc(db('office1'), 'romaneios', 'p1'))).data();
    if (p.responsavelEscritorioUid !== 'office1' || p.finalizadoPorUid !== 'office2') throw new Error('Autoria incorreta');
    await assertSucceeds(etapa('office2', 'em_andamento'));
    p = (await getDoc(doc(db('office1'), 'romaneios', 'p1'))).data();
    if (p.responsavelEscritorioUid !== 'office2' || p.finalizadoEm !== null) throw new Error('Reabertura incorreta');
    const eventos = await getDocs(collection(db('office1'), 'romaneios', 'p1', 'historicoEscritorio'));
    if (eventos.size !== 4) throw new Error('Histórico incompleto');
    await assertFails(updateDoc(eventos.docs[0].ref, { usuario: 'Alterado' }));
    await assertFails(deleteDoc(eventos.docs[0].ref));
});
test('etapas não permitem saltos, alteração financeira, falsificação ou ausência de histórico', async () => {
    await validar();
    await assertFails(etapa('office1', 'finalizada'));
    await assertFails(etapa('office1', 'em_andamento', {}, false));
    await assertFails(etapa('office1', 'em_andamento', { precoUnitario: '1' }));
    await assertFails(etapa('buyer1', 'em_andamento'));
    await assertFails(etapa('weigher1', 'em_andamento'));
    await assertSucceeds(etapa('office1', 'em_andamento'));
    await assertFails(etapa('office1', 'recebida'));
});
test('documento após Finalizada exige revalidação e retorna Recebida preservando histórico anterior', async () => {
    await validar(); await etapa('office1', 'em_andamento'); await etapa('office1', 'finalizada');
    await assertSucceeds(complemento(db('weigher1')));
    await assertFails(etapa('office1', 'em_andamento'));
    await assertSucceeds(validar(2));
    const p = (await getDoc(doc(db('office1'), 'romaneios', 'p1'))).data();
    if (p.etapaEscritorio !== 'recebida' || p.finalizadoPorUid !== null || p.revisaoValidada !== 2) throw new Error('Nova revisão não foi recebida corretamente');
    const eventos = await getDocs(collection(db('office1'), 'romaneios', 'p1', 'historicoEscritorio'));
    if (eventos.size !== 4) throw new Error('Histórico da finalização anterior foi perdido');
});

test('código da compra é obrigatório e permanece imutável na revalidação e no escritório', async () => {
    await validar();
    await assertFails(updateDoc(doc(db('office1'), 'romaneios', 'p1'), { codigoCompra: 'OC-OUTRA-202610-p1' }));
    await complemento(db('weigher1'));
    const d = db('buyer1'), b = writeBatch(d), evento = doc(collection(d, 'romaneios', 'p1', 'historicoEscritorio'));
    b.set(doc(d, 'romaneios', 'p1'), { ...financeiro(2, evento.id), codigoCompra: 'OC-OUTRA-202610-p1' });
    b.set(evento, { tipo: 'validacao_originador', etapa: 'recebida', etapaAnterior: null, usuarioUid: 'buyer1', usuario: 'Ana', revisao: 2, quando: serverTimestamp() });
    b.update(doc(d, 'pesagens', 'p1'), { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
    await assertFails(b.commit());
    await assertSucceeds(validar(2));
    const compra = (await getDoc(doc(d, 'romaneios', 'p1'))).data();
    if (compra.codigoCompra !== 'OC-FAZENDA-202610-p1') throw new Error('Código alterado');
});

test('categorias dos documentos são aceitas na pesagem e no complemento sem tornar anexos obrigatórios', async () => {
    const anexo = { nomeArquivo: 'GTA.pdf', categoria: 'gta', caminho: 'pesagens/p1/weigher1/f1', urlDownload: 'https://example.test/GTA.pdf' };
    await assertSucceeds(setDoc(doc(db('weigher1'), 'pesagens', 'com-nota'), { ...pesagem(), anexos: ['nota.pdf'], anexosLinks: [{ ...anexo, nomeArquivo: 'nota.pdf', categoria: 'nota_fiscal' }], anexosCaminhos: [anexo.caminho] }));
    await assertSucceeds(complemento(db('weigher1'), { anexosLinks: [anexo] }, false));
    const dados = (await getDoc(doc(db('buyer1'), 'pesagens', 'p1'))).data();
    if (dados.anexosLinks[0].categoria !== 'gta') throw new Error('Categoria não preservada');
    await assertSucceeds(setDoc(doc(db('weigher1'), 'pesagens', 'sem-anexos'), pesagem()));
});

test('troca obrigatória bloqueia dados e não pode ser removida pelo cliente; sessões antigas continuam bloqueadas depois', async () => {
    await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(),'usuarios','buyer1'),{trocaSenhaObrigatoria:true}));
    await assertSucceeds(getDoc(doc(db('buyer1'),'usuarios','buyer1')));
    await assertFails(getDoc(doc(db('buyer1'),'pesagens','p1')));
    await assertFails(updateDoc(doc(db('buyer1'),'usuarios','buyer1'),{trocaSenhaObrigatoria:false}));
    await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(),'usuarios','buyer1'),{trocaSenhaObrigatoria:false,sessaoRevogadaEm:1000}));
    await assertFails(getDoc(doc(env.authenticatedContext('buyer1',{auth_time:1000}).firestore(),'pesagens','p1')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('buyer1',{auth_time:1001}).firestore(),'pesagens','p1')));
    await assertFails(setDoc(doc(db('office1'),'usuarios','outra-conta'),user('Outra','pesador',true)));
    await assertFails(setDoc(doc(db('office1'),'auditoriaContas','forjado'),{tipo:'criacao'}));
});


async function numerarAntiga(uid, id) {
    const d = db(uid);
    const contador = doc(d, 'contadores', 'compras');
    return executarNumeracao(leitura => runTransaction(d, async t => {
        const ref = doc(d, 'romaneios', id), anterior = await t.get(ref);
        if (temNumeroCompra(anterior.data())) return anterior.data().numeroCompra;
        const numeroCompra = await reservarNumeroCompra(t, contador, anterior.data(), id, leitura);
        t.update(ref, {numeroCompra});
        return numeroCompra;
    }), async () => (await getDoc(contador)).data()?.valor || 0);
}
test('numeração legada usa contador atômico e mantém números distintos sob concorrência', async () => {
    const resultados = await Promise.all([numerarAntiga('office1', 'legacy'), numerarAntiga('office2', 'other')]);
    if (new Set(resultados).size !== 2 || Math.min(...resultados) !== 1 || Math.max(...resultados) !== 2) throw new Error('Numeração duplicada');
    if (await numerarAntiga('office1', 'legacy') !== resultados[0]) throw new Error('Código mudou');
    await assertFails(updateDoc(doc(db('office1'), 'romaneios', 'legacy'), {numeroCompra: 99}));
    await assertFails(deleteDoc(doc(db('office1'), 'contadores', 'compras')));
});
test('ninguém reserva número isolado, pula sequência ou numera compra alheia', async () => {
    await assertFails(setDoc(doc(db('office1'), 'contadores', 'compras'), {valor: 1, compraId: 'legacy'}));
    await assertFails(updateDoc(doc(db('office1'), 'romaneios', 'legacy'), {numeroCompra: 1}));
    await assertFails(numerarAntiga('buyer1', 'legacy'));
    await assertFails(getDoc(doc(db('weigher1'), 'contadores', 'compras')));
    const d = db('office1'), b = writeBatch(d);
    b.set(doc(d, 'contadores', 'compras'), {valor: 8, compraId: 'legacy'});
    b.update(doc(d, 'romaneios', 'legacy'), {numeroCompra: 8});
    await assertFails(b.commit());
    const c = writeBatch(d);
    c.set(doc(d, 'contadores', 'compras'), {valor: 1, compraId: 'legacy'});
    c.update(doc(d, 'romaneios', 'legacy'), {numeroCompra: 1});
    c.update(doc(d, 'romaneios', 'other'), {numeroCompra: 1});
    await assertFails(c.commit());
});

test('consulta de envio anterior permite criar compra nova e localizar repetição sem acessar compras alheias', async () => {
    const d = db('weigher1'), id = '64fc9f6f-9567-4f54-9ceb-e61b40cd8421';
    // Reproduz o bloqueio anterior: o alvo não existe e não há resource para avaliar.
    await assertFails(getDocs(query(collection(d, 'pesagens'), where('pesadorUid', '==', 'weigher1'), where('__name__', '==', id))));
    const minhas = query(collection(d, 'pesagens'), where('pesadorUid', '==', 'weigher1'));
    const antes = await assertSucceeds(getDocs(minhas));
    if (antes.docs.some(d => d.id === id)) throw new Error('Compra inesperada');
    await assertSucceeds(setDoc(doc(d, 'pesagens', id), pesagem()));
    const depois = await assertSucceeds(getDocs(minhas));
    if (depois.docs.filter(d => d.id === id).length !== 1) throw new Error('Envio anterior não localizado');
    await assertSucceeds(getDoc(doc(db('buyer1'), 'pesagens', id)));
    const outras = await assertSucceeds(getDocs(query(collection(db('weigher2'), 'pesagens'), where('pesadorUid', '==', 'weigher2'))));
    if (outras.docs.some(d => d.id === id)) throw new Error('Vazamento para outro pesador');
    await assertFails(getDoc(doc(db('weigher2'), 'pesagens', id)));
});

