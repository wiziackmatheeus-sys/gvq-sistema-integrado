export const etapasEscritorio = {
    recebida: { nome: 'Recebida', classe: 'tag' },
    em_andamento: { nome: 'Em andamento', classe: 'tag tag-indigo' },
    finalizada: { nome: 'Finalizada', classe: 'tag tag-verde' }
};
export function etapaAtual(compra) { return compra.etapaEscritorio || 'recebida'; }
export function podeMudarEtapa(anterior, proxima) {
    return (anterior === 'recebida' && proxima === 'em_andamento') ||
        (anterior === 'em_andamento' && proxima === 'finalizada') ||
        (anterior === 'finalizada' && proxima === 'em_andamento');
}
