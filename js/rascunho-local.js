// Um rascunho por UID e navegador. IndexedDB preserva inclusive os arquivos.
export function abrirBancoRascunhos() {
    return new Promise((resolve, reject) => {
        const pedido = indexedDB.open('gvq-rascunhos', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('pesador', { keyPath: 'uid' });
        pedido.onerror = () => reject(pedido.error);
        pedido.onblocked = () => reject(new Error('Feche as outras abas do sistema e tente novamente.'));
        pedido.onsuccess = () => {
            const banco = pedido.result;
            banco.onversionchange = () => banco.close();
            resolve({
                ler(uid) {
                    return new Promise((ok, erro) => {
                        const tx = banco.transaction('pesador', 'readonly');
                        const req = tx.objectStore('pesador').get(uid);
                        tx.oncomplete = () => ok(req.result);
                        tx.onabort = () => erro(tx.error);
                    });
                },
                gravar(uid, revisao, registro) {
                    return new Promise((ok, erro) => {
                        const tx = banco.transaction('pesador', 'readwrite');
                        const tabela = tx.objectStore('pesador');
                        const req = tabela.get(uid);
                        let conflito = false;
                        req.onsuccess = () => {
                            // Evita sobrescrever silenciosamente o trabalho de outra aba.
                            if ((req.result?.revisao || 0) !== revisao) { conflito = true; tx.abort(); return; }
                            if (registro) tabela.put(registro); else tabela.delete(uid);
                        };
                        tx.oncomplete = () => ok();
                        tx.onabort = () => erro(conflito
                            ? new Error('O rascunho mudou em outra aba. Reabra esta página para continuar.')
                            : tx.error || new Error('Não foi possível salvar neste navegador.'));
                    });
                }
            });
        };
    });
}

export async function criarRascunhoLocal({ uid, capturar, restaurar, informar, banco, novoId = () => crypto.randomUUID() }) {
    banco ||= await abrirBancoRascunhos();
    let registro = await banco.ler(uid);
    if (registro && (registro.versao !== 1 || registro.uid !== uid)) throw new Error('Formato de rascunho incompatível.');
    let revisao = registro?.revisao || 0;
    let id = registro?.pesagemId || novoId();
    let fila = Promise.resolve();
    let falha = null;
    let ativo = true;
    let pendentes = 0;
    if (registro) await restaurar(registro.dados);
    informar(registro ? 'Rascunho recuperado neste aparelho.' : 'O preenchimento será salvo automaticamente neste aparelho.');

    function executar(operacao) {
        const tarefa = fila.then(async () => {
            if (!ativo) throw new Error('Sessão encerrada.');
            try {
                const resultado = await operacao();
                falha = null;
                return resultado;
            }
            catch (error) { falha = error; informar('Rascunho não salvo. ' + error.message, true); throw error; }
        });
        fila = tarefa.catch(() => {});
        return tarefa;
    }
    return {
        get id() { return id; },
        salvar() {
            if (!ativo) return Promise.resolve();
            // Capturar antes da fila preserva exatamente o preenchimento de cada evento.
            const dados = capturar();
            pendentes++;
            informar('Salvando rascunho neste aparelho...');
            return executar(async () => {
                const proximo = { uid, versao: 1, revisao: novoId(), pesagemId: id, atualizadoEm: Date.now(), dados };
                await banco.gravar(uid, revisao, proximo);
                revisao = proximo.revisao;
            }).finally(() => {
                pendentes--;
                if (!pendentes && !falha && ativo) informar('Rascunho salvo neste aparelho às ' + new Date().toLocaleTimeString('pt-BR') + '.');
            });
        },
        apagar() {
            return executar(async () => {
                await banco.gravar(uid, revisao, null);
                revisao = 0; id = novoId(); registro = null;
                informar('Nenhum rascunho salvo neste aparelho.');
            });
        },
        encerrar() { ativo = false; }
    };
}
