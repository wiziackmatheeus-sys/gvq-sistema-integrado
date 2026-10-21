import { codigoDaCompra } from './codigo-compra.js';
export const normalizarTexto = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const compararNomes = (a,b) => String(a || '').localeCompare(String(b || ''),'pt-BR',{ sensitivity: 'base', numeric: true });
export function sugerirLogin(nome) {
    const partes = normalizarTexto(nome).replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(Boolean);
    return partes.length ? `${partes[0]}.${partes.at(-1)}`.slice(0,60) : '';
}
export function buscarCompras(lista, { texto = '', data = '', mes = '', status = '', tipo = '' } = {}) {
    const termos = normalizarTexto(texto).split(/\s+/).filter(Boolean);
    return lista.filter(r => {
        const conteudo = normalizarTexto([codigoDaCompra(r),r.codigoCompra,r.id,r.pecuarista,r.pesador,r.comprador,r.fazendaDestino,r.cidade,r.estado,r.raca,r.sexo].join(' '));
        return termos.every(t => conteudo.includes(t)) && (!data || r.dataCompra === data)
            && (!mes || r.dataCompra?.startsWith(mes)) && (!status || (r.status || 'enviado_escritorio') === status)
            && (!tipo || (tipo === 'revalidacao' ? !!r.validadoEm : !r.validadoEm));
    });
}
export function aplicarBuscaTabela(tbodyId, busca) {
    const tbody = document.getElementById(tbodyId);
    tbody.querySelector('[data-sem-resultado]')?.remove();
    const linhas = [...tbody.querySelectorAll('tr[data-busca]')];
    const termos = normalizarTexto(busca).split(/\s+/).filter(Boolean);
    linhas.forEach(tr => { tr.hidden = !termos.every(t => normalizarTexto(tr.dataset.busca).includes(t)); });
    if (linhas.length && linhas.every(tr => tr.hidden)) {
        const tr = document.createElement('tr'); tr.dataset.semResultado = '';
        const td = document.createElement('td'); td.colSpan = linhas[0].cells.length; td.className = 'celula-vazia'; td.textContent = 'Nenhum resultado encontrado.';
        tr.appendChild(td); tbody.appendChild(tr);
    }
}

