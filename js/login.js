import { signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { paginas } from "./auth-guard.js";
import { sugerirLogin } from "./buscas.js";

let autenticando = false;

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (autenticando || cadastrando) return;
    autenticando = true;
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
                alert('A sua conta está em análise. Aguarde a aprovação do escritório.');
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
        autenticando = false;
        btn.innerText = "Entrar";
        btn.disabled = false;
    }
});


// O perfil solicitado nunca libera acesso: somente o escritório pode aprová-lo.
let cadastrando = false;
function mostrarAba(cadastro) {
    if (cadastrando || autenticando) return;
    for (const [nome, ativo] of [['login', !cadastro], ['cadastro', cadastro]]) {
        document.getElementById('aba-' + nome).classList.toggle('active', ativo);
        document.getElementById('aba-' + nome).setAttribute('aria-pressed', String(ativo));
        document.getElementById(nome + '-form').classList.toggle('active', ativo);
    }
}
document.getElementById('aba-login').onclick = () => mostrarAba(false);
document.getElementById('aba-cadastro').onclick = () => mostrarAba(true);
document.getElementById('cadastro_nome').addEventListener('input', () => {
    document.getElementById('cadastro_usuario').value = sugerirLogin(document.getElementById('cadastro_nome').value);
});
document.getElementById('form-cadastro').addEventListener('submit', async e => {
    e.preventDefault();
    if (cadastrando || autenticando) return;
    const campo = id => document.getElementById('cadastro_' + id);
    const nome = campo('nome').value.trim(), login = sugerirLogin(nome);
    campo('usuario').value = login;
    if (!login) { alert('Informe o nome e o sobrenome completos para gerar o usuário (até 60 caracteres).'); return; }
    const perfil = campo('perfil').value, senha = campo('senha').value;
    if (nome.length < 3 || nome.length > 100 || !/^[a-z0-9][a-z0-9._-]{2,59}$/.test(login)
        || !['originador', 'pesador', 'escritorio'].includes(perfil) || senha.length < 6 || senha.length > 128) {
        alert('Confira o nome, usuário, perfil e senha (mínimo de 6 caracteres).'); return;
    }
    cadastrando = true;
    const botao = document.getElementById('btn-cadastrar'); botao.disabled = true; botao.textContent = 'Enviando cadastro...';
    const mensagem = document.getElementById('mensagem-acesso'); mensagem.hidden = true;
    let novoUsuario, perfilSalvo = false;
    try {
        novoUsuario = (await createUserWithEmailAndPassword(auth, `${login}@gvq.com.br`, senha)).user;
        await setDoc(doc(db, 'usuarios', novoUsuario.uid), { nome, login, perfil, aprovado: false, criadoEm: serverTimestamp() });
        perfilSalvo = true;
        await signOut(auth);
        e.target.reset();
        document.getElementById('login_usuario').value = login;
        cadastrando = false; mostrarAba(false);
        mensagem.textContent = 'Cadastro enviado! Aguarde a aprovação do escritório para entrar.';
        mensagem.hidden = false;
    } catch (error) {
        if (novoUsuario && !perfilSalvo) {
            try { await deleteUser(novoUsuario); }
            catch { alert('O cadastro ficou incompleto. Peça ao escritório para verificar sua conta antes de tentar novamente.'); }
        }
        if (novoUsuario) await signOut(auth).catch(() => {});
        const erros = {
            'auth/email-already-in-use': 'Este usuário já está em uso. Se você já tem conta, entre com sua senha. Caso contrário, solicite ajuda ao escritório.',
            'auth/weak-password': 'Escolha uma senha mais forte, com pelo menos 6 caracteres.',
            'auth/password-does-not-meet-requirements': 'A senha não atende aos requisitos. Use letras, números e símbolos.',
            'auth/network-request-failed': 'Falha de conexão. Confira a internet e tente novamente.',
            'permission-denied': 'Não foi possível enviar o cadastro. O escritório precisa atualizar as regras de cadastro no Firebase.'
        };
        alert(perfilSalvo ? 'Cadastro enviado. Entre novamente após a aprovação do escritório.' : erros[error.code] || 'Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
        cadastrando = false; botao.disabled = false; botao.textContent = 'Solicitar cadastro';
    }
});
