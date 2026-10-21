// Uma espera encerrada não cancela gravações do Firestore: o resultado pode chegar depois.
export function comPrazo(operacao, mensagem, { ms = 30000, resultadoIncerto = false } = {}) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error(mensagem), { resultadoIncerto })), ms);
        Promise.resolve(operacao).then(
            valor => { clearTimeout(timer); resolve(valor); },
            erro => { clearTimeout(timer); reject(erro); }
        );
    });
}

export function acompanharUpload(tarefa, progresso, { inatividadeMs = 45000, totalMs = 300000 } = {}) {
    return new Promise((resolve, reject) => {
        let encerrado = false, inatividade, total, cancelarEscuta;
        let bytesAnteriores = -1;
        const terminar = (erro, valor) => {
            if (encerrado) return;
            encerrado = true; clearTimeout(inatividade); clearTimeout(total); cancelarEscuta?.();
            if (erro) reject(erro); else resolve(valor);
        };
        const expirar = () => {
            terminar(new Error('O envio do arquivo não respondeu a tempo. Confira sua conexão e o armazenamento no Firebase.'));
            tarefa.cancel();
        };
        inatividade = setTimeout(expirar, inatividadeMs);
        total = setTimeout(expirar, totalMs);
        cancelarEscuta = tarefa.on('state_changed', snapshot => {
            if (encerrado) return;
            if (snapshot.bytesTransferred > bytesAnteriores) {
                bytesAnteriores = snapshot.bytesTransferred;
                clearTimeout(inatividade); inatividade = setTimeout(expirar, inatividadeMs);
            }
            progresso?.(snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0);
        }, erro => terminar(erro), () => terminar(null, tarefa.snapshot));
    });
}
