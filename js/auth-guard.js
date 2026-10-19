import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";

export const paginas = { originador: 'painel.html', comprador: 'painel.html', pesador: 'pesador.html', escritorio: 'escritorio.html' };

export async function exigirPerfil(user, perfis, sessaoValida = () => true) {
    try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!sessaoValida()) return null;
        const perfil = snap.exists() ? snap.data() : null;
        if (!perfil || !paginas[perfil.perfil] || perfil.aprovado !== true) {
            alert('Perfil não encontrado ou aguardando aprovação.');
            await signOut(auth);
            window.location.href = '../index.html';
            return null;
        }
        if (perfil.perfil === 'pesador' && !perfil.compradorUid) {
            alert('Aguarde o escritório aprovar seu cadastro e definir o originador responsável.');
            await signOut(auth);
            window.location.href = '../index.html';
            return null;
        }
        const funcao = perfil.perfil === 'comprador' ? 'originador' : perfil.perfil;
        if (!perfis.includes(funcao)) {
            window.location.href = paginas[perfil.perfil];
            return null;
        }
        return { ...perfil, perfil: funcao, uid: user.uid };
    } catch (error) {
        if (!sessaoValida()) return null;
        alert('Não foi possível verificar seu acesso. Tente entrar novamente.');
        window.location.href = '../index.html';
        return null;
    }
}
