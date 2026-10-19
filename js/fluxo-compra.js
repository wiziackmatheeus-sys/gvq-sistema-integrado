// Somente estes campos podem atravessar a coleção visível ao pesador.
export const camposPesagem = [
    'estado', 'cidade', 'fazendaDestino', 'cidadeDestino', 'ufDestino',
    'pecuarista', 'dataCompra', 'dataPagamento', 'cabecas', 'pesoTotal',
    'sexo', 'raca', 'pesosIndividuais', 'observacoes', 'anexos'
];

export function dadosPesagem(dados) {
    return Object.fromEntries(camposPesagem.map(campo => [campo, dados[campo]]));
}

export function validarPesagem(dados) {
    if (!dados.pecuarista || !dados.estado || !dados.cidade || !dados.fazendaDestino ||
        !dados.dataCompra || !dados.sexo || !dados.raca?.trim()) {
        throw new Error('Preencha origem, destino, pecuarista, data da pesagem, sexo e raça.');
    }
    const pesos = dados.pesosIndividuais;
    if (!Array.isArray(pesos) || !pesos.length || pesos.some(p => !Number.isFinite(p) || p <= 0)) {
        throw new Error('Lance e confirme os pesos individuais dos animais.');
    }
    const total = pesos.reduce((soma, peso) => soma + peso, 0);
    const informado = Number(dados.pesoTotal);
    if (!Number.isFinite(total) || !Number.isFinite(informado) || Number(dados.cabecas) !== pesos.length || Math.abs(informado - total) > 0.011) {
        throw new Error('Cabeças e peso total devem corresponder aos pesos individuais. Confirme a pesagem novamente.');
    }
}

export function validarNegociacao(dados) {
    validarPesagem(dados);
    if (!Number.isFinite(Number(dados.precoUnitario)) || Number(dados.precoUnitario) <= 0 ||
        !['Por Kg', 'Por Arroba', 'Por Cabeça'].includes(dados.unidadePreco)) {
        throw new Error('Informe um preço maior que zero e a unidade da negociação.');
    }
    if (!['Nenhuma', 'Fixo', 'Por Cabeça', '% do Romaneio'].includes(dados.tipoComissao)) {
        throw new Error('Selecione um tipo de comissão válido.');
    }
    if (dados.tipoComissao !== 'Nenhuma' &&
        (!Number.isFinite(Number(dados.valorComissao)) || Number(dados.valorComissao) < 0)) {
        throw new Error('Informe uma comissão válida.');
    }
}

export function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
