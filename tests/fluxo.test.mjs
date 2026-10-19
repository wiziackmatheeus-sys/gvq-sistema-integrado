import test from 'node:test';
import assert from 'node:assert/strict';
import { dadosPesagem, validarPesagem, validarNegociacao } from '../js/fluxo-compra.js';
const pesagem = { estado: 'SP', cidade: 'Barretos', fazendaDestino: 'Fazenda GVQ', cidadeDestino: 'Ibitinga', ufDestino: 'SP', pecuarista: 'Pecuarista', dataCompra: '2026-10-19', dataPagamento: '2026-10-23', cabecas: '2', pesoTotal: '650.50', sexo: 'Macho', raca: 'Nelore', pesosIndividuais: [300, 350.5], observacoes: '', anexos: [] };
const negociacao = { ...pesagem, precoUnitario: '300', unidadePreco: 'Por Arroba', valorTotalGado: 'R$ 6.505,00', tipoComissao: 'Nenhuma', valorComissao: '' };
test('pesagem compartilhada nunca contém campos financeiros', () => {
    const publica = dadosPesagem(negociacao);
    assert.deepEqual(publica, pesagem);
    assert.ok(!('precoUnitario' in publica));
});
test('pesagem exige pesos positivos e totais consistentes', () => {
    assert.doesNotThrow(() => validarPesagem(pesagem));
    for (const alteracao of [{ pesosIndividuais: [] }, { pesosIndividuais: [0, 350.5] }, { pesosIndividuais: [NaN] }, { cabecas: '3' }, { pesoTotal: '700' }, { pesoTotal: 'abc' }, { sexo: '' }, { raca: '' }]) {
        assert.throws(() => validarPesagem({ ...pesagem, ...alteracao }));
    }
});
test('comprador precisa preencher preço e unidade antes de validar', () => {
    assert.doesNotThrow(() => validarNegociacao(negociacao));
    for (const preco of ['', '0', '-1', 'abc']) assert.throws(() => validarNegociacao({ ...negociacao, precoUnitario: preco }));
    assert.throws(() => validarNegociacao({ ...negociacao, unidadePreco: '' }));
});
