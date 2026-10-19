import { gerarCodigoCompra, codigoDaCompra } from '../js/codigo-compra.js';
import { podeMudarEtapa, etapaAtual } from '../js/etapas-escritorio.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dadosPesagem, pesoMedio, pesagemFoiAlterada, validarPesagem, validarNegociacao } from '../js/fluxo-compra.js';
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

test('mesmo balanção com chaves de mapas em outra ordem não é uma alteração', () => {
    const original = { ...base, tipoPesagem: 'balancao', pesosIndividuais: [], revisao: 1,
        anexosLinks: [{ nomeArquivo: 'GTA.pdf', caminho: 'pesagens/p1/GTA', urlDownload: 'https://example.test/GTA' }] };
    const atual = Object.fromEntries(Object.entries({ ...original,
        anexosLinks: [{ urlDownload: 'https://example.test/GTA', caminho: 'pesagens/p1/GTA', nomeArquivo: 'GTA.pdf' }]
    }).reverse());
    assert.notEqual(JSON.stringify(original), JSON.stringify(atual));
    assert.equal(pesagemFoiAlterada(original, atual), false);
});
test('sincronização de timestamps não invalida dados de negócio inalterados', () => {
    const original = { ...base, revisao: 1, timestamp: null };
    const atual = { ...base, revisao: 1, timestamp: { seconds: 1792425600, nanoseconds: 0 } };
    assert.equal(pesagemFoiAlterada(original, atual), false);
});
test('alterações reais continuam exigindo nova conferência', () => {
    const original = { ...base, revisao: 1, compradorUid: 'buyer1', pesadorUid: 'weigher1', anexosLinks: [], anexosCaminhos: [] };
    for (const campos of [{ revisao: 2 }, { cabecas: '3' }, { pesoTotal: '700' }, { dataPagamento: '2026-10-24' },
        { compradorUid: 'buyer2' }, { pesadorUid: 'weigher2' }, { observacoes: 'Outro lote' },
        { anexos: ['GTA.pdf'] }, { anexosCaminhos: ['pesagens/p1/GTA'] }, { anexosLinks: [{ nomeArquivo: 'GTA.pdf' }] },
        { pesosIndividuais: [350.5, 300] }]) {
        assert.equal(pesagemFoiAlterada(original, { ...original, ...campos }), true, JSON.stringify(campos));
    }
});
test('registros antigos sem revisão continuam comparáveis sem ignorar mudanças', () => {
    assert.equal(pesagemFoiAlterada(base, { ...base, revisao: 1 }), false);
    assert.equal(pesagemFoiAlterada(null, base), true);
    assert.equal(pesagemFoiAlterada(base, null), true);
});

test('etapas do escritório seguem Recebida, Em andamento, Finalizada e reabertura', () => {
    assert.equal(etapaAtual({}), 'recebida');
    assert.equal(podeMudarEtapa('recebida', 'em_andamento'), true);
    assert.equal(podeMudarEtapa('em_andamento', 'finalizada'), true);
    assert.equal(podeMudarEtapa('finalizada', 'em_andamento'), true);
    assert.equal(podeMudarEtapa('recebida', 'finalizada'), false);
    assert.equal(podeMudarEtapa('finalizada', 'recebida'), false);
});

test('ordem de compra usa fazenda de destino, mês da compra e ID completo', () => {
    const compra = { ...base, fazendaDestino: 'Fazenda São José' };
    assert.equal(gerarCodigoCompra(compra, 'AbCd1234EFgh5678IjKl'), 'OC-SAO-JOSE-202610-AbCd1234EFgh5678IjKl');
    assert.notEqual(gerarCodigoCompra(compra, 'a'), gerarCodigoCompra(compra, 'b'));
    assert.notEqual(gerarCodigoCompra(compra, 'a'), gerarCodigoCompra({ ...compra, dataCompra: '2026-11-01' }, 'a'));
    assert.notEqual(gerarCodigoCompra(compra, 'a'), gerarCodigoCompra({ ...compra, fazendaDestino: 'Outra' }, 'a'));
    assert.equal(codigoDaCompra({ ...compra, id: 'a', codigoCompra: 'OC-FIXO-202609-a' }), 'OC-FIXO-202609-a');
    assert.equal(codigoDaCompra({ id: 'legado' }), 'OC-FAZENDA-SEM-DATA-legado');
});
