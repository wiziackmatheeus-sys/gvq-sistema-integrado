import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";

export const paginas = { comprador: 'painel.html', pesador: 'pesador.html', escritorio: 'escritorio.html' };

export async function exigirPerfil(user, perfis) {
    try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const perfil = snap.exists() ? snap.data() : null;
        if (!perfil || !paginas[perfil.perfil] || perfil.aprovado !== true) {
            alert('Perfil não encontrado ou aguardando aprovação.');
            await signOut(auth);
            window.location.href = '../index.html';
            return null;
        }
        if (!perfis.includes(perfil.perfil)) {
            window.location.href = paginas[perfil.perfil];
            return null;
        }
        return { ...perfil, uid: user.uid };
    } catch (error) {
        alert('Não foi possível verificar seu acesso. Tente entrar novamente.');
        window.location.href = '../index.html';
        return null;
    }
}
