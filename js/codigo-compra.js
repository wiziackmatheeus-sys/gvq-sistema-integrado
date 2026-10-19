// O ID completo diferencia compras da mesma fazenda/mês sem contador compartilhado.
export function gerarCodigoCompra(compra, id) {
    if (!id) throw new Error('Compra sem identificação interna.');
    const fazenda = String(compra.fazendaDestino || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/^FAZENDA\s+/, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
        .slice(0, 24).replace(/-$/, '') || 'FAZENDA';
    const mes = /^\d{4}-\d{2}-\d{2}$/.test(compra.dataCompra || '') ? compra.dataCompra.slice(0, 7).replace('-', '') : 'SEM-DATA';
    return `OC-${fazenda}-${mes}-${encodeURIComponent(id)}`;
}
export function codigoDaCompra(compra) {
    return compra.codigoCompra || gerarCodigoCompra(compra, compra.id);
}
