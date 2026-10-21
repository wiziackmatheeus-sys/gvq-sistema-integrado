import { acompanharUpload, comPrazo } from './controle-envio.js';
import { categoriaDocumento } from './documentos.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { storage } from './firebase.js';
storage.maxUploadRetryTime = 45000;
storage.maxOperationRetryTime = 15000;

export async function enviarAnexos(arquivos, { uid, pesagemId, financeiro = false, aoProgresso }) {
    const enviados = [];
    try {
        for (const [indice, entrada] of arquivos.entries()) {
            const arquivo = entrada.arquivo || entrada;
            const categoria = categoriaDocumento(entrada);
            if (arquivo.size > 25 * 1024 * 1024) throw new Error(`O arquivo ${arquivo.name} ultrapassa 25 MB.`);
            const caminho = `${financeiro ? 'negociacoes' : 'pesagens'}/${pesagemId}/${uid}/${crypto.randomUUID()}`;
            const destino = ref(storage, caminho);
            // Guardar o caminho também permite limpar um upload cancelado.
            enviados.push({ nomeArquivo: arquivo.name, caminho, categoria });
            aoProgresso?.(`Enviando anexo ${indice + 1}/${arquivos.length}: 0%`);
            const tarefa = uploadBytesResumable(destino, arquivo, { contentType: arquivo.type || 'application/octet-stream', customMetadata: { nomeOriginal: arquivo.name, categoria } });
            await acompanharUpload(tarefa, percentual => aoProgresso?.(`Enviando anexo ${indice + 1}/${arquivos.length}: ${percentual}%`));
            aoProgresso?.(`Confirmando anexo ${indice + 1}/${arquivos.length}...`);
            enviados[enviados.length - 1].urlDownload = await comPrazo(getDownloadURL(destino), 'O armazenamento não confirmou o arquivo. Confira o Firebase e tente novamente.');
        }
        return enviados;
    } catch (error) {
        await limparUploads(enviados);
        const mensagens = {
            'storage/unauthorized': 'O armazenamento não autorizou o arquivo. Confira as regras do Storage.',
            'storage/unauthenticated': 'Sua sessão expirou. Entre novamente antes de enviar.',
            'storage/bucket-not-found': 'O armazenamento de arquivos não está configurado no projeto Firebase.',
            'storage/project-not-found': 'O projeto de armazenamento não foi encontrado.',
            'storage/quota-exceeded': 'O armazenamento atingiu o limite. O responsável deve conferir a cota e o faturamento no Firebase.',
            'storage/retry-limit-exceeded': 'O armazenamento não respondeu. Confira a conexão e a configuração do Storage.'
        };
        throw new Error('Não foi possível enviar os anexos. ' + (mensagens[error.code] || error.message));
    }
}
export async function limparUploads(anexos) {
    await Promise.allSettled(anexos.map(a => comPrazo(deleteObject(ref(storage, a.caminho)), 'Limpeza de arquivo sem resposta.', { ms: 5000 })));
}
export function unirAnexos(...listas) {
    return [...new Map(listas.flat().map(a => [a.caminho || a.urlDownload, a])).values()];
}


