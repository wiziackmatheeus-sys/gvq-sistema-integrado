import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { paginas } from "./auth-guard.js";

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-entrar');
    btn.innerText = "Autenticando...";
    btn.disabled = true;

    const loginInput = document.getElementById('login_usuario').value.toLowerCase().trim();
    const senhaInput = document.getElementById('login_senha').value;
    const emailFake = `${loginInput}@gvq.com.br`;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, emailFake, senhaInput);
        const uid = userCredential.user.uid;

        const docSnap = await getDoc(doc(db, "usuarios", uid));

        if (docSnap.exists()) {
            const userData = docSnap.data();

            if(!paginas[userData.perfil] || userData.aprovado !== true || (userData.perfil === 'pesador' && !userData.compradorUid)) {
                alert('A sua conta está em análise. Aguarde aprovação da administração.');
                await auth.signOut();
                btn.innerText = "Entrar";
                btn.disabled = false;
                return;
            }

            if (userData.trocaSenhaObrigatoria) { window.location.href = 'pages/trocar-senha.html'; return; }

            localStorage.setItem('gvq_sistema_logado', userData.nome);
            localStorage.setItem('gvq_sistema_perfil', userData.perfil);

            window.location.href = 'pages/' + paginas[userData.perfil];
        } else {
            alert("Perfil não encontrado no banco de dados.");
            await auth.signOut();
        }
    } catch (error) {
        alert("Login ou senha incorretos!");
    } finally {
        btn.innerText = "Entrar";
        btn.disabled = false;
    }
});

