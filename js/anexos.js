import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { storage } from './firebase.js';

export async function enviarAnexos(arquivos, { uid, pesagemId, financeiro = false }) {
    const enviados = [];
    try {
        for (const arquivo of arquivos) {
            if (arquivo.size > 25 * 1024 * 1024) throw new Error(`O arquivo ${arquivo.name} ultrapassa 25 MB.`);
            const caminho = `${financeiro ? 'negociacoes' : 'pesagens'}/${pesagemId}/${uid}/${crypto.randomUUID()}`;
            const destino = ref(storage, caminho);
            await uploadBytes(destino, arquivo, { contentType: arquivo.type || 'application/octet-stream', customMetadata: { nomeOriginal: arquivo.name } });
            // Registrar o caminho antes de obter a URL para limpar também em caso de falha na URL.
            enviados.push({ nomeArquivo: arquivo.name, caminho });
            enviados[enviados.length - 1].urlDownload = await getDownloadURL(destino);
        }
        return enviados;
    } catch (error) {
        await limparUploads(enviados);
        throw new Error('Não foi possível enviar os anexos. Confira o armazenamento e tente novamente. ' + error.message);
    }
}
export async function limparUploads(anexos) {
    await Promise.allSettled(anexos.map(a => deleteObject(ref(storage, a.caminho))));
}
export function unirAnexos(...listas) {
    return [...new Map(listas.flat().map(a => [a.caminho || a.urlDownload, a])).values()];
}
