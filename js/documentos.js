export const tiposDocumento = [
    ['nota_fiscal', 'Nota fiscal'], ['gta', 'GTA'], ['romaneio_manual', 'Romaneio manual'],
    ['ordem_embarque_checklist', 'Ordem de embarque / checklist'],
    ['foto_gado', 'Foto do gado'], ['video_gado', 'Vídeo do gado'], ['foto_carreta', 'Foto da carreta'], ['outros', 'Outros']
];
export function categoriaDocumento(anexo) {
    return tiposDocumento.some(([tipo]) => tipo === anexo.categoria) ? anexo.categoria : 'outros';
}
export function nomeDocumento(anexo) {
    return tiposDocumento.find(([tipo]) => tipo === categoriaDocumento(anexo))[1];
}
export function montarCamposDocumentos(containerId, inputOutros, aoMudar) {
    const container = document.getElementById(containerId);
    container.className = 'form-grid form-grid-4';
    tiposDocumento.forEach(([tipo, nome]) => {
        const id = tipo === 'outros' ? inputOutros : `${inputOutros}_${tipo}`;
        const grupo = document.createElement('div'); grupo.className = 'form-group';
        const accept = tipo === 'video_gado' ? 'video/*' : tipo.startsWith('foto_') ? 'image/*' : '';
        grupo.innerHTML = `<label for="${id}">${nome}</label><div class="upload-area"><span class="upload-texto"><strong>Adicionar arquivos</strong></span><input type="file" id="${id}" data-categoria="${tipo}" multiple ${accept ? `accept="${accept}"` : ''}></div><span class="texto-suave" data-situacao="${tipo}">Não anexado</span>`;
        grupo.querySelector('input').addEventListener('change', aoMudar);
        container.appendChild(grupo);
    });
}
export function atualizarSituacaoDocumentos(containerId, anexos) {
    document.querySelectorAll(`#${containerId} [data-situacao]`).forEach(el => {
        const total = anexos.filter(a => categoriaDocumento(a) === el.dataset.situacao).length;
        el.textContent = total ? `${total} arquivo(s)` : 'Não anexado';
    });
}

