import { buscarCompras } from './buscas.js';
import { codigoDaCompra } from './codigo-compra.js';
import { etapaAtual } from './etapas-escritorio.js';
const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function filtrarCompras(compras, filtros = {}) {
    return buscarCompras(compras, { texto:filtros.texto }).filter(r => (!filtros.codigo || normalizar(codigoDaCompra(r)).includes(normalizar(filtros.codigo)))
        && (!filtros.fazenda || r.fazendaDestino === filtros.fazenda)
        && (!filtros.originador || (r.compradorUid || r.comprador) === filtros.originador)
        && (!filtros.etapa || etapaAtual(r) === filtros.etapa)
        && (!filtros.mes || (r.dataCompra || '').slice(0, 7) === filtros.mes));
}
