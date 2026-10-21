import { categoriaDocumento } from './documentos.js';

export function registrarAnexosTexto(arquivos, { uid, pesagemId, financeiro = false, novoId = () => crypto.randomUUID() }) {
    return arquivos.map(entrada => ({
        nomeArquivo: (entrada.arquivo || entrada).name,
        categoria: categoriaDocumento(entrada),
        // Chave interna para distinguir indicações, inclusive nomes repetidos.
        // Não representa um arquivo no Storage e nunca é usada para download.
        caminho: `demonstracao/${financeiro ? 'negociacoes' : 'pesagens'}/${pesagemId}/${uid}/${novoId()}`,
        somenteTexto: true
    }));
}
