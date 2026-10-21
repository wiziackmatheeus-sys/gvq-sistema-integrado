// compradorUid/comprador continuam sendo os identificadores legados do originador no banco.
export const camposPesagem = [
    'estado', 'cidade', 'fazendaDestino', 'cidadeDestino', 'ufDestino',
    'pecuarista', 'pecuaristaDocumento', 'pecuaristaBanco', 'pecuaristaAgencia', 'pecuaristaConta',
    'dataCompra', 'dataPagamento', 'cabecas', 'pesoTotal', 'pesoMedio', 'tipoPesagem',
    'sexo', 'raca', 'pesosIndividuais', 'observacoes', 'anexos'
];
export function dadosPesagem(dados) {
    return Object.fromEntries(camposPesagem.map(campo => [campo, dados[campo]]));
}
export function pesoMedio(cabecas, pesoTotal) {
    const quantidade = Number(cabecas), peso = Number(pesoTotal);
    return Number.isInteger(quantidade) && quantidade > 0 && Number.isFinite(peso) && peso > 0 ? Number((peso / quantidade).toFixed(2)) : null;
}
export function validarPesagem(dados) {
    const obrigatorios = {
        estado: 'Estado de origem', cidade: 'Cidade de origem', fazendaDestino: 'Fazenda de destino',
        cidadeDestino: 'Cidade de destino', ufDestino: 'Estado de destino', pecuarista: 'Pecuarista',
        pecuaristaDocumento: 'CPF/CNPJ do pecuarista', pecuaristaBanco: 'Banco do pecuarista',
        pecuaristaAgencia: 'Agência do pecuarista', pecuaristaConta: 'Conta do pecuarista',
        dataCompra: 'Data da pesagem', dataPagamento: 'Data de pagamento', sexo: 'Sexo', raca: 'Raça'
    };
    for (const [campo, nome] of Object.entries(obrigatorios)) {
        if (!String(dados[campo] ?? '').trim()) throw new Error(`Preencha ${nome}. Dados incompletos no cadastro do pecuarista ou destino devem ser corrigidos pelo escritório.`);
    }
    const media = pesoMedio(dados.cabecas, dados.pesoTotal);
    if (media === null) throw new Error('Informe uma quantidade inteira de cabeças e um peso total maiores que zero.');
    if (!Number.isFinite(Number(dados.pesoMedio)) || Math.abs(Number(dados.pesoMedio) - media) > 0.011) throw new Error('Confira o peso médio dos animais.');
    const pesos = dados.pesosIndividuais;
    if (!Array.isArray(pesos)) throw new Error('Pesagem inválida.');
    if (dados.tipoPesagem === 'individual') {
        if (!pesos.length || pesos.some(p => !Number.isFinite(p) || p <= 0)) throw new Error('Lance e confirme os pesos individuais.');
        const total = pesos.reduce((soma, peso) => soma + peso, 0);
        if (!Number.isFinite(total) || Number(dados.cabecas) !== pesos.length || Math.abs(Number(dados.pesoTotal) - total) > 0.011) {
            throw new Error('Cabeças e peso total diferem dos pesos individuais. Confirme os pesos ou selecione Balancão.');
        }
    } else if (dados.tipoPesagem !== 'balancao' || pesos.length) throw new Error('Selecione o tipo de pesagem e confirme os pesos.');
}
export function validarNegociacao(dados) {
    validarPesagem(dados);
    if (!Number.isFinite(Number(dados.precoUnitario)) || Number(dados.precoUnitario) <= 0 ||
        !['Por Kg', 'Por Arroba', 'Por Cabeça'].includes(dados.unidadePreco)) throw new Error('Informe um preço maior que zero e a unidade da negociação.');
    if (!String(dados.corretor ?? '').trim()) throw new Error('Informe o corretor ou preencha Sem corretor.');
    if (!['Nenhuma', 'Fixo', 'Por Cabeça', '% do Romaneio'].includes(dados.tipoComissao)) throw new Error('Selecione um tipo de comissão válido.');
    if (dados.valorComissao === '' || !Number.isFinite(Number(dados.valorComissao)) || Number(dados.valorComissao) < 0) throw new Error('Informe a comissão; use zero quando não houver comissão.');
    if (!dados.valorTotalGado || !dados.totalComissao) throw new Error('Confira o total do gado e da comissão.');
    if (dados.tipoComissao === 'Nenhuma' && Number(dados.valorComissao) !== 0) throw new Error('Sem comissão, o valor deve ser zero.');
}
// A ordem das chaves de um mapa não representa mudança no seu conteúdo.
function normalizarMapa(valor) {
    if (Array.isArray(valor)) return valor.map(normalizarMapa);
    if (valor !== null && typeof valor === 'object') {
        return Object.fromEntries(Object.keys(valor).sort().map(chave => [chave, normalizarMapa(valor[chave])]));
    }
    return valor;
}
export function pesagemFoiAlterada(original, atual) {
    if (!original || !atual || (original.revisao ?? 1) !== (atual.revisao ?? 1)) return true;
    // Datas técnicas de sincronização não são dados conferidos no formulário.
    // Novos documentos continuam detectados pela revisão e pelos próprios anexos.
    const camposConferidos = [...camposPesagem, 'compradorUid', 'comprador', 'pesadorUid', 'pesador',
        'status', 'anexosLinks', 'anexosCaminhos'];
    return camposConferidos.some(campo =>
        JSON.stringify(normalizarMapa(original[campo])) !== JSON.stringify(normalizarMapa(atual[campo])));
}

export function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
