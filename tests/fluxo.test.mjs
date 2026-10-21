import { registrarAnexosTexto } from '../js/anexos-texto.js';
import { ANEXOS_SOMENTE_TEXTO } from '../js/configuracao.js';
import { compararNomes, buscarCompras, sugerirLogin } from '../js/buscas.js';
import { filtrarCompras } from '../js/filtros-compras.js';
import { categoriaDocumento, nomeDocumento, tiposDocumento } from '../js/documentos.js';
import { gerarCodigoCompra, codigoDaCompra, reservarNumeroCompra, temNumeroCompra, executarNumeracao } from '../js/codigo-compra.js';
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

test('código técnico legado é preservado e número público usa somente dígitos', () => {
    const compra = { ...base, fazendaDestino: 'Fazenda São José' };
    assert.equal(gerarCodigoCompra(compra, 'AbCd1234EFgh5678IjKl'), 'OC-SAO-JOSE-202610-AbCd1234EFgh5678IjKl');
    assert.notEqual(gerarCodigoCompra(compra, 'a'), gerarCodigoCompra(compra, 'b'));
    assert.notEqual(gerarCodigoCompra(compra, 'a'), gerarCodigoCompra({ ...compra, dataCompra: '2026-11-01' }, 'a'));
    assert.notEqual(gerarCodigoCompra(compra, 'a'), gerarCodigoCompra({ ...compra, fazendaDestino: 'Outra' }, 'a'));
    assert.equal(codigoDaCompra({ ...compra, numeroCompra: 1, codigoCompra: 'OC-FIXO-202609-a' }), '000001');
    assert.equal(codigoDaCompra({ id: 'legado' }), '');
    assert.equal(temNumeroCompra({numeroCompra: -1}), false);
});

test('filtros de compras combinam código, fazenda, originador, etapa e mês com compatibilidade antiga', () => {
    const compras = [{ ...base, id: 'a', numeroCompra: 12, codigoCompra: 'OC-SAO-JOSE-202610-a', compradorUid: 'u1', comprador: 'Ana', etapaEscritorio: 'finalizada' },
        { ...base, id: 'b', comprador: 'Antigo', dataCompra: '2026-11-02' }];
    assert.equal(filtrarCompras(compras, { codigo: '000012', fazenda: base.fazendaDestino, originador: 'u1', etapa: 'finalizada', mes: '2026-10' })[0].id, 'a');
    assert.deepEqual(filtrarCompras(compras, { mes: '2026-12' }), []);
    assert.equal(filtrarCompras(compras, { originador: 'Antigo', etapa: 'recebida', mes: '2026-11' })[0].id, 'b');
    assert.equal(filtrarCompras(compras).length, 2);
    assert.equal(buscarCompras(compras, {texto:'000012'})[0].id, 'a');
    assert.equal(filtrarCompras(compras,{texto:'pecuarista barretos'}).length,2);
});
test('documentos possuem oito categorias opcionais e antigos ficam em Outros', () => {
    assert.equal(tiposDocumento.length, 8);
    assert.equal(categoriaDocumento({}), 'outros');
    assert.equal(categoriaDocumento({ categoria: 'inexistente' }), 'outros');
    assert.equal(nomeDocumento({ categoria: 'gta' }), 'GTA');
    assert.equal(nomeDocumento({ categoria: 'ordem_embarque_checklist' }), 'Ordem de embarque / checklist');
});

test('buscas ignoram acentos, combinam termos e filtros; nomes e raças seguem ordem pt-BR', () => {
    const compras = [{ ...base, id:'p1', pesador:'João', status:'aguardando_comprador', validadoEm:123 }, { ...base, id:'p2', pecuarista:'Outra pessoa',dataCompra:'2026-11-01' }];
    assert.equal(buscarCompras(compras,{texto:'joao GVQ',mes:'2026-10',tipo:'revalidacao'})[0].id,'p1');
    assert.deepEqual(buscarCompras(compras,{texto:'inexistente'}),[]);
    assert.equal(buscarCompras(compras,{status:'enviado_escritorio'})[0].id,'p2');
    assert.equal(buscarCompras(compras,{data:'2026-11-01',tipo:'primeira'})[0].id,'p2');
    assert.deepEqual(['Nelore','Brangus','F1 Angus','Europeu','Cruzado'].sort(compararNomes),['Brangus','Cruzado','Europeu','F1 Angus','Nelore']);
    assert.equal(sugerirLogin(' João da Silva '),'joao.silva');
});



test('número público é sequencial, reutilizado na revalidação e rejeita contador inválido', async () => {
    const escritas = [];
    const tx = { get: async () => ({ exists: () => true, data: () => ({valor: 8}) }), set: (ref, dados) => escritas.push(dados) };
    assert.equal(await reservarNumeroCompra(tx, {}, null, 'compra'), 9);
    assert.deepEqual(escritas, [{valor: 9, compraId: 'compra'}]);
    assert.equal(await reservarNumeroCompra(tx, {}, {numeroCompra: 3}, 'compra'), 3);
    assert.equal(escritas.length, 1);
    tx.get = async () => ({ exists: () => true, data: () => ({valor: 999999999}) });
    await assert.rejects(reservarNumeroCompra(tx, {}, null, 'compra'), /contador/);
});

test('disputa por número só repete a transação quando o contador realmente avançou', async () => {
    let tentativas = 0;
    const erro = Object.assign(new Error('Negado'), {code: 'permission-denied'});
    assert.equal(await executarNumeracao(async leitura => {
        tentativas++; leitura.valor = 0;
        if (tentativas === 1) throw erro;
        return 2;
    }, async () => 1), 2);
    assert.equal(tentativas, 2);
    tentativas = 0;
    await assert.rejects(executarNumeracao(async leitura => { tentativas++; leitura.valor = 0; throw erro; }, async () => 0), /Negado/);
    assert.equal(tentativas, 1);
});


test('demonstração ativa registra múltiplos nomes e categorias sem conteúdo nem URL de arquivo', () => {
    assert.equal(ANEXOS_SOMENTE_TEXTO, true);
    const arquivos = [{arquivo: {name: 'nota.pdf', size: 99 * 1024 * 1024}, categoria: 'nota_fiscal'},
        {arquivo: {name: 'nota.pdf', size: 3}, categoria: 'ordem_embarque_checklist'}];
    let sequencia = 0;
    const registros = registrarAnexosTexto(arquivos, {uid: 'pesador', pesagemId: 'p1', novoId: () => String(++sequencia)});
    assert.deepEqual(registros.map(a => [a.nomeArquivo,a.categoria,a.somenteTexto]), [['nota.pdf','nota_fiscal',true],['nota.pdf','ordem_embarque_checklist',true]]);
    assert.notEqual(registros[0].caminho,registros[1].caminho);
    assert.ok(registros.every(a => a.caminho.startsWith('demonstracao/') && !('urlDownload' in a) && !('arquivo' in a)));
    assert.deepEqual(registrarAnexosTexto([], {uid:'pesador',pesagemId:'p1'}), []);
});
