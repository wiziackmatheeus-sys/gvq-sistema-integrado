import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRascunhoLocal } from '../js/rascunho-local.js';

function ambiente() {
    const registros = new Map();
    const banco = {
        async ler(uid) { return structuredClone(registros.get(uid)); },
        async gravar(uid, revisao, registro) {
            if ((registros.get(uid)?.revisao || 0) !== revisao) throw new Error('Rascunho alterado em outra aba.');
            if (registro) registros.set(uid, structuredClone(registro)); else registros.delete(uid);
        }
    };
    return { banco, registros };
}
async function cliente(banco, uid = 'pesador-1') {
    let dados = { campos: { rom_obs: '' }, grade: ['', ''], pesosConfirmados: [], arquivos: [] };
    const mensagens = [];
    const controle = await criarRascunhoLocal({ banco, uid,
        capturar: () => structuredClone(dados), restaurar: d => { dados = d; },
        informar: (texto, erro) => mensagens.push({ texto, erro }) });
    return { controle, mensagens, get dados() { return dados; } };
}

test('recupera preenchimento incompleto, grade não confirmada e conteúdo de arquivo após reabrir', async () => {
    const { banco } = ambiente(); const c = await cliente(banco);
    c.dados.campos.rom_obs = 'Sem preencher os obrigatórios';
    c.dados.grade = ['300.25', '', '401'];
    c.dados.arquivos = [{ arquivo: new Blob(['arquivo original']), categoria: 'nota_fiscal' }];
    await c.controle.salvar();
    const aberto = await cliente(banco);
    assert.equal(aberto.dados.campos.rom_obs, 'Sem preencher os obrigatórios');
    assert.deepEqual(aberto.dados.grade, ['300.25', '', '401']);
    assert.deepEqual(aberto.dados.pesosConfirmados, []);
    assert.equal(await aberto.dados.arquivos[0].arquivo.text(), 'arquivo original');
    assert.equal(aberto.controle.id, c.controle.id);
});
test('rascunhos pertencem ao UID; outra conta não os recupera nem apaga', async () => {
    const { banco, registros } = ambiente(); const a = await cliente(banco, 'a');
    a.dados.campos.rom_obs = 'Privado'; await a.controle.salvar();
    const b = await cliente(banco, 'b'); assert.equal(b.dados.campos.rom_obs, '');
    await b.controle.apagar(); assert.ok(registros.has('a'));
});
test('salvamentos rápidos mantêm o estado mais recente e descarte aguarda a fila', async () => {
    const { banco, registros } = ambiente(); const c = await cliente(banco);
    c.dados.campos.rom_obs = 'A'; const primeiro = c.controle.salvar();
    c.dados.campos.rom_obs = 'B'; const segundo = c.controle.salvar();
    await Promise.all([primeiro, segundo]);
    assert.equal((await cliente(banco)).dados.campos.rom_obs, 'B');
    const id = c.controle.id;
    await c.controle.salvar(); await c.controle.apagar();
    assert.equal(registros.size, 0); assert.notEqual(c.controle.id, id);
});
test('falha de espaço não indica sucesso nem elimina o rascunho anterior', async () => {
    const { banco, registros } = ambiente(); const c = await cliente(banco);
    c.dados.campos.rom_obs = 'Salvo'; await c.controle.salvar();
    banco.gravar = async () => { throw new Error('Espaço insuficiente'); };
    c.dados.campos.rom_obs = 'Não salvo';
    await assert.rejects(c.controle.salvar(), /Espaço insuficiente/);
    assert.equal(c.mensagens.at(-1).erro, true);
    assert.equal(registros.get('pesador-1').dados.campos.rom_obs, 'Salvo');
    await assert.rejects(c.controle.apagar()); assert.equal(registros.size, 1);
});
test('outra aba com revisão antiga não sobrescreve nem descarta o rascunho novo', async () => {
    const { banco } = ambiente(); const a = await cliente(banco); await a.controle.salvar();
    const b = await cliente(banco);
    a.dados.campos.rom_obs = 'Atual'; await a.controle.salvar();
    b.dados.campos.rom_obs = 'Antigo'; await assert.rejects(b.controle.salvar(), /outra aba/);
    await assert.rejects(b.controle.apagar());
    assert.equal((await cliente(banco)).dados.campos.rom_obs, 'Atual');
});
test('encerramento impede gravações futuras e formato incompatível não é sobrescrito', async () => {
    const { banco, registros } = ambiente(); const c = await cliente(banco);
    c.controle.encerrar(); await c.controle.salvar(); assert.equal(registros.size, 0);
    registros.set('pesador-1', { uid: 'pesador-1', versao: 99 });
    await assert.rejects(cliente(banco), /incompatível/); assert.equal(registros.get('pesador-1').versao, 99);
});
