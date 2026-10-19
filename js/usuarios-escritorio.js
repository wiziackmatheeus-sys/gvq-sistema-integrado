import { doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { chamarConta } from './contas-api.js';
import { compararNomes, normalizarTexto, sugerirLogin } from './buscas.js';
let usuarios = [];
const elemento = id => document.getElementById(id);
export function limparCredenciais() { elemento('resultado-conta').hidden = true; elemento('senha-temporaria').value = ''; elemento('login-temporario').textContent = ''; }
function mostrarCredenciais(dados) {
    elemento('resultado-conta').hidden = false; elemento('login-temporario').textContent = dados.login;
    elemento('senha-temporaria').value = dados.senhaTemporaria;
    elemento('resultado-conta').scrollIntoView({ behavior:'smooth', block:'nearest' });
}
export function atualizarUsuarios(lista) {
    usuarios = [...lista].sort((a,b) => compararNomes(a.nome,b.nome));
    const select = elemento('conta-originador'), atual = select.value;
    select.replaceChildren(new Option('Selecione o originador...', ''));
    usuarios.filter(u => ['comprador','originador'].includes(u.perfil) && u.aprovado && !u.trocaSenhaObrigatoria).forEach(u => select.add(new Option(u.nome,u.uid)));
    select.value = atual;
    renderizarUsuarios();
}
function renderizarUsuarios() {
    const termos = normalizarTexto(elemento('busca-usuarios').value).split(/\s+/).filter(Boolean);
    const perfil = elemento('filtro-perfil-usuarios').value, situacao = elemento('filtro-situacao-usuarios').value;
    const lista = usuarios.filter(u => ['pesador','originador','comprador','escritorio'].includes(u.perfil))
        .filter(u => (!perfil || (u.perfil === 'comprador' ? 'originador' : u.perfil) === perfil)
            && termos.every(t => normalizarTexto([u.nome,u.login,u.comprador].join(' ')).includes(t))
            && (!situacao || (situacao === 'senha' ? u.trocaSenhaObrigatoria : situacao === 'pendente' ? !u.aprovado || (u.perfil === 'pesador' && !u.compradorUid) : u.aprovado && (u.perfil !== 'pesador' || u.compradorUid) && !u.trocaSenhaObrigatoria)));
    const tbody = elemento('tbody-usuarios'); tbody.replaceChildren();
    if (!lista.length) tbody.innerHTML = '<tr><td colspan="5" class="celula-vazia">Nenhum usuário encontrado.</td></tr>';
    lista.forEach(p => {
        const tr = document.createElement('tr');
        const ativo = p.aprovado && (p.perfil !== 'pesador' || p.compradorUid);
        for (const texto of [p.nome + (p.login ? ' · ' + p.login : ''),p.perfil === 'pesador' ? 'Pesador' : p.perfil === 'escritorio' ? 'Escritório' : 'Originador',p.trocaSenhaObrigatoria ? 'Troca de senha pendente' : ativo ? 'Aprovado' : 'Aguardando aprovação']) {
            const td = document.createElement('td'); td.textContent = texto; tr.appendChild(td);
        }
        const tdVinculo = document.createElement('td'), acoes = document.createElement('td');
        if (p.perfil === 'pesador') {
            const select = document.createElement('select'); select.required = true; select.setAttribute('aria-label','Originador de ' + p.nome);
            select.add(new Option('Selecione o originador...', ''));
            usuarios.filter(u => ['originador','comprador'].includes(u.perfil) && u.aprovado).forEach(u => select.add(new Option(u.nome,u.uid)));
            select.value = p.compradorUid || ''; const grupo = document.createElement('div'); grupo.className = 'form-group'; grupo.appendChild(select); tdVinculo.appendChild(grupo);
            const aprovar = document.createElement('button'); aprovar.type = 'button'; aprovar.className = 'btn btn-primario btn-sm';
            aprovar.textContent = ativo ? 'Atualizar vínculo' : 'Aprovar e vincular';
            aprovar.onclick = async () => {
                if (!select.reportValidity()) return; aprovar.disabled = true;
                try {
                    await runTransaction(db,async t => {
                        const destino = doc(db,'usuarios',p.uid), origem = doc(db,'usuarios',select.value);
                        const [pesador, originador] = await Promise.all([t.get(destino),t.get(origem)]);
                        if (!pesador.exists() || pesador.data().perfil !== 'pesador' || !originador.exists() || !['originador','comprador'].includes(originador.data().perfil) || originador.data().aprovado !== true) throw new Error('Pesador ou originador indisponível.');
                        t.update(destino,{ aprovado:true, compradorUid:origem.id, comprador:originador.data().nome, aprovadoPor:auth.currentUser.uid, aprovadoEm:serverTimestamp() });
                    });
                    alert('Pesador aprovado e vinculado ao originador.');
                } catch (error) { alert('Não foi possível aprovar: ' + error.message); }
                finally { aprovar.disabled = false; }
            };
            acoes.appendChild(aprovar);
        } else tdVinculo.textContent = '—';
        if (p.uid !== auth.currentUser.uid) {
            const redefinir = document.createElement('button'); redefinir.type = 'button'; redefinir.className = 'btn btn-fantasma btn-sm'; redefinir.textContent = 'Redefinir senha';
            redefinir.onclick = async () => {
                if (!confirm('Redefinir a senha de ' + p.nome + '? A senha atual deixará de funcionar; o histórico será preservado.')) return;
                limparCredenciais(); redefinir.disabled = true;
                try { mostrarCredenciais(await chamarConta('redefinirSenha',{ uid:p.uid })); }
                catch (error) { alert('Não foi possível redefinir: ' + error.message); }
                finally { redefinir.disabled = false; }
            };
            acoes.appendChild(redefinir);
        } else acoes.textContent = '—';
        tr.append(tdVinculo,acoes); tbody.appendChild(tr);
    });
}
['busca-usuarios','filtro-perfil-usuarios','filtro-situacao-usuarios'].forEach(id => elemento(id).addEventListener(id === 'busca-usuarios' ? 'input' : 'change',renderizarUsuarios));
elemento('ocultar-credenciais').onclick = limparCredenciais;
function ajustarPerfil() { const pesador = elemento('conta-perfil').value === 'pesador'; elemento('grupo-conta-originador').hidden = !pesador; elemento('grupo-conta-originador').style.display = pesador ? '' : 'none'; elemento('conta-originador').required = pesador; }
elemento('conta-perfil').onchange = ajustarPerfil;
elemento('conta-nome').addEventListener('blur',() => { if (!elemento('conta-login').value) elemento('conta-login').value = sugerirLogin(elemento('conta-nome').value); });
elemento('form-criar-conta').addEventListener('submit',async e => {
    e.preventDefault(); const botao = elemento('btn-criar-conta'); botao.disabled = true; limparCredenciais();
    try {
        const dados = await chamarConta('criarConta',{ nome:elemento('conta-nome').value, login:elemento('conta-login').value, perfil:elemento('conta-perfil').value, compradorUid:elemento('conta-originador').value });
        e.target.reset(); ajustarPerfil(); mostrarCredenciais(dados);
    } catch (error) { alert('Não foi possível criar: ' + error.message); }
    finally { botao.disabled = false; }
});
ajustarPerfil();

window.addEventListener('pagehide',limparCredenciais);
