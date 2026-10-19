import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { paginas } from "./auth-guard.js";

window.switchTab = function(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
    document.querySelectorAll('.form-content').forEach(f => f.classList.remove('active'));
    if(tab === 'login') { 
        document.querySelectorAll('.tab')[0].classList.add('active'); 
        document.getElementById('login-form').classList.add('active'); 
    } else { 
        document.querySelectorAll('.tab')[1].classList.add('active'); 
        document.getElementById('cadastro-form').classList.add('active'); 
    }
}

window.gerarUsuario = function() {
    const nome = document.getElementById('cad_nome').value.trim(); 
    const hint = document.getElementById('hint-usuario');
    if(nome.includes(' ')) {
        let partes = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(' ').filter(p => p.length > 0);
        if(partes.length > 1) { 
            document.getElementById('usuario-gerado').innerText = `${partes[0]}.${partes[partes.length - 1]}`; 
            hint.style.display = 'block'; return; 
        }
    }
    hint.style.display = 'none';
}

document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-cadastrar');
    btn.innerText = "Processando...";
    btn.disabled = true;

    const nome = document.getElementById('cad_nome').value.trim();
    const perfil = document.getElementById('cad_perfil').value;
    const senha = document.getElementById('cad_senha').value;
    
    let partes = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(' ').filter(p => p.length > 0);
    let login = `${partes[0]}.${partes[partes.length - 1]}`;
    let emailFake = `${login}@gvq.com.br`; 

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, emailFake, senha);
        const uid = userCredential.user.uid;
        
        await setDoc(doc(db, "usuarios", uid), {
            nome: nome,
            login: login,
            perfil: perfil,
            aprovado: (perfil === 'comprador' || perfil === 'pesador')
        });

        await auth.signOut();

        if(perfil === 'escritorio') { 
            alert('Cadastro solicitado com sucesso! Contas de Escritório precisam de aprovação.'); 
        } else { 
            alert('Conta criada com sucesso! O seu login é: ' + login); 
        }
        
        document.getElementById('login_usuario').value = login;
        window.switchTab('login');
        document.getElementById('form-cadastro').reset();
        document.getElementById('hint-usuario').style.display = 'none';

    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            alert('Este usuário já está cadastrado no sistema.');
        } else if (error.code === 'auth/weak-password') {
            alert('A senha deve ter pelo menos 6 caracteres.');
        } else {
            alert("Erro ao criar conta: " + error.message);
        }
    } finally {
        btn.innerText = "Cadastrar";
        btn.disabled = false;
    }
});

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
            
            if(!paginas[userData.perfil] || userData.aprovado !== true) {
                alert('A sua conta está em análise. Aguarde aprovação da administração.');
                await auth.signOut();
                btn.innerText = "Entrar";
                btn.disabled = false;
                return;
            }
            
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

