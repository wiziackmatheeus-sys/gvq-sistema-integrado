import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth } from './firebase.js';

export function criarControleSessao(aoErro) {
    const consultas = new Set();
    let ativa = false;
    let saindo = false;
    let versao = 0;

    function desligar(consulta) {
        consulta.cancelar?.();
        consulta.cancelar = null;
    }
    function ligar(consulta) {
        const inicio = versao;
        const podeAtualizar = () => ativa && !saindo && versao === inicio && auth.currentUser !== null;
        consulta.cancelar = onSnapshot(consulta.referencia,
            snapshot => { if (podeAtualizar()) consulta.receber(snapshot); },
            error => { if (podeAtualizar()) consulta.erro(error); });
    }
    function encerrar() {
        ativa = false;
        versao++;
        consultas.forEach(desligar);
        consultas.clear();
    }
    function iniciar() {
        encerrar();
        ativa = true;
        saindo = false;
        const inicio = versao;
        return () => ativa && !saindo && versao === inicio;
    }
    function observar(referencia, receber, erro = aoErro) {
        if (!ativa || saindo) return () => {};
        const consulta = { referencia, receber, erro, cancelar: null };
        consultas.add(consulta);
        ligar(consulta);
        return () => { desligar(consulta); consultas.delete(consulta); };
    }
    async function sair() {
        if (saindo) return;
        saindo = true;
        versao++;
        // Cancelar os listeners antes de remover a autenticação. Callbacks já
        // enfileirados também são descartados por podeAtualizar().
        consultas.forEach(desligar);
        try {
            await signOut(auth);
        } catch (error) {
            saindo = false;
            if (ativa && auth.currentUser) {
                consultas.forEach(ligar);
                alert('Não foi possível sair da conta: ' + error.message);
            }
            return;
        }
        encerrar();
        try {
            localStorage.removeItem('gvq_sistema_logado');
            localStorage.removeItem('gvq_sistema_perfil');
        } catch {
            // O logout já foi concluído mesmo se o navegador bloquear o armazenamento local.
        }
        window.location.href = '../index.html';
    }
    return { iniciar, observar, encerrar, sair };
}
