// O ID completo diferencia compras da mesma fazenda/mês sem contador compartilhado.
export function gerarCodigoCompra(compra, id) {
    if (!id) throw new Error('Compra sem identificação interna.');
    const fazenda = String(compra.fazendaDestino || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/^FAZENDA\s+/, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
        .slice(0, 24).replace(/-$/, '') || 'FAZENDA';
    const mes = /^\d{4}-\d{2}-\d{2}$/.test(compra.dataCompra || '') ? compra.dataCompra.slice(0, 7).replace('-', '') : 'SEM-DATA';
    return `OC-${fazenda}-${mes}-${encodeURIComponent(id)}`;
}
// Número público independente do identificador técnico do Firestore.
export function temNumeroCompra(compra) {
    return Number.isSafeInteger(compra?.numeroCompra) && compra.numeroCompra > 0 && compra.numeroCompra <= 999999999;
}
export function codigoDaCompra(compra) {
    return temNumeroCompra(compra) ? String(compra.numeroCompra).padStart(6, '0') : '';
}
// A reserva e a gravação da compra precisam fazer parte da mesma transação.
export async function reservarNumeroCompra(transacao, contador, compra, id, leitura = {}) {
    if (temNumeroCompra(compra)) return compra.numeroCompra;
    const snapshot = await transacao.get(contador);
    const atual = snapshot.exists() ? snapshot.data().valor : 0;
    if (!Number.isSafeInteger(atual) || atual < 0 || atual >= 999999999) throw new Error('Não foi possível gerar o número da compra. Confira o contador.');
    leitura.valor = atual;
    const numero = atual + 1;
    transacao.set(contador, { valor: numero, compraId: id });
    return numero;
}

// Em uma disputa pelo primeiro número, o servidor pode negar a escrita antes
// de informar o conflito da transação. Só repetir se o contador avançou.
export async function executarNumeracao(executar, lerValorAtual) {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
        const leitura = {};
        try { return await executar(leitura); }
        catch (erro) {
            if (tentativa === 3 || erro.code !== 'permission-denied' || leitura.valor === undefined) throw erro;
            if (await lerValorAtual() <= leitura.valor) throw erro;
        }
    }
}
