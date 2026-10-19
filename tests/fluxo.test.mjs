import test from 'node:test';
import assert from 'node:assert/strict';
import { dadosPesagem, pesoMedio, validarPesagem, validarNegociacao } from '../js/fluxo-compra.js';
const base = { estado: 'SP', cidade: 'Barretos', fazendaDestino: 'Fazenda GVQ', cidadeDestino: 'Ibitinga', ufDestino: 'SP', pecuarista: 'Pecuarista', pecuaristaDocumento: '123', pecuaristaBanco: 'Banco', pecuaristaAgencia: '1', pecuaristaConta: '2', dataCompra: '2026-10-19', dataPagamento: '2026-10-23', cabecas: '2', pesoTotal: '650.50', pesoMedio: '325.25', tipoPesagem: 'individual', sexo: 'Macho', raca: 'F1 Angus', pesosIndividuais: [300, 350.5], observacoes: '', anexos: [] };
const negociacao = { ...base, precoUnitario: '300', unidadePreco: 'Por Arroba', valorTotalGado: 'R$ 6.505,00', corretor: 'Sem corretor', tipoComissao: 'Nenhuma', valorComissao: '0', totalComissao: 'R$ 0,00' };
test('dados compartilhados excluem todos os valores da negociação', () => {
    assert.deepEqual(dadosPesagem(negociacao), base);
});
test('balanção aceita cabeças e total sem pesos individuais e calcula a média', () => {
    assert.doesNotThrow(() => validarPesagem({ ...base, tipoPesagem: 'balancao', pesosIndividuais: [] }));
    assert.equal(pesoMedio('3', '1000'), 333.33);
    for (const [quantidade, peso] of [['0','100'],['2','0'],['2.5','100'],['2','abc']]) assert.equal(pesoMedio(quantidade, peso), null);
});
test('pesagem individual exige pesos positivos e totais coerentes', () => {
    assert.doesNotThrow(() => validarPesagem(base));
    for (const campos of [{ pesosIndividuais: [] }, { pesosIndividuais: [0, 650.5] }, { cabecas: '3' }, { pesoTotal: '700' }, { pesoMedio: '999' }, { tipoPesagem: 'balancao' }]) assert.throws(() => validarPesagem({ ...base, ...campos }));
});
test('informações de destino, pecuarista, datas, sexo e raça são obrigatórias', () => {
    for (const campo of ['estado','cidade','fazendaDestino','cidadeDestino','ufDestino','pecuarista','pecuaristaDocumento','pecuaristaBanco','pecuaristaAgencia','pecuaristaConta','dataCompra','dataPagamento','sexo','raca']) assert.throws(() => validarPesagem({ ...base, [campo]: '' }), campo);
    assert.doesNotThrow(() => validarPesagem({ ...base, observacoes: '', anexos: [] }));
});
test('negociação exige preço, corretor, comissão e totais; aceita zero quando não há comissão', () => {
    assert.doesNotThrow(() => validarNegociacao(negociacao));
    for (const campo of ['precoUnitario','unidadePreco','corretor','tipoComissao','valorComissao','valorTotalGado','totalComissao']) assert.throws(() => validarNegociacao({ ...negociacao, [campo]: '' }), campo);
    assert.throws(() => validarNegociacao({ ...negociacao, valorComissao: '10' }));
});
