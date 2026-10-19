import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { exigirPerfil } from "./auth-guard.js";
import { dadosPesagem, validarPesagem, validarNegociacao, escapeHtml } from "./fluxo-compra.js";

let pecuaristasGlobais = [];
let destinosGlobais = [];
let cidadesEstadoGlobais = [];
let pesosAdicionadosGlobais = []; 
let totalCamposPeso = 50; 
let nomeCompradorLogado = "";
let arquivosFilaGlobais = [];
const ehPesador = document.body.dataset.perfil === 'pesador';
let usuarioAtual = null;
let compradoresDisponiveis = [];
let pesagensPendentes = [];
let pesagemEmConferencia = null;
let pesagemOriginal = null;
let anexosExistentes = [];
const textoEnviar = ehPesador ? 'Enviar ao comprador' : 'Validar e enviar ao escritório';
const valor = id => document.getElementById(id)?.value || '';
const erroSincronizacao = error => alert('Não foi possível carregar os dados: ' + error.message);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = await exigirPerfil(user, [ehPesador ? 'pesador' : 'comprador']);
        if (!usuarioAtual) return;
        nomeCompradorLogado = usuarioAtual.nome;
        document.getElementById('nome-usuario').innerText = 'Olá, ' + nomeCompradorLogado.split(' ')[0];
        
        gerarGrelhaPesosInit();
        
        // INICIALIZA OS AUTOCOMPLETES VERTICAIS
        configurarAutocomplete('rom_cidade', 'lista_cidades_ui', () => cidadesEstadoGlobais, () => {});
        configurarAutocomplete('rom_fazenda_destino', 'lista_destinos_ui', () => destinosGlobais.map(d => d.nome), window.preencherDestino);
        configurarAutocomplete('rom_busca_pec', 'lista_pecuaristas_ui', () => pecuaristasGlobais.map(p => p.nome), window.preencherPecuarista);

        try {
            let res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
            let estados = await res.json();
            let ufSelect = document.getElementById('rom_uf');
            estados.forEach(e => ufSelect.innerHTML += `<option value="${e.sigla}">${e.nome}</option>`);
        } catch(e) { console.log('Erro IBGE'); }

        puxarPecuaristasDaNuvem();
        puxarDestinosDaNuvem(); 
        puxarHistoricoDaNuvem();
        if (ehPesador) puxarCompradores();
        else { puxarPendentes(); window.mostrarPendentes(); }
    } else {
        window.location.href = '../index.html';
    }
});

// ===============================================
// SISTEMA DE AUTOCOMPLETE VERTICAL
// ===============================================
function configurarAutocomplete(inputId, listDivId, getOpcoesArray, onSelectCallback) {
    const input = document.getElementById(inputId);
    const listDiv = document.getElementById(listDivId);

    function renderizarLista(filtro = '') {
        let opcoes = getOpcoesArray();
        listDiv.innerHTML = '';
        
        let filtrados = opcoes.filter(o => o.toLowerCase().includes(filtro.toLowerCase()));
        
        if(filtrados.length === 0) {
            listDiv.style.display = 'none';
            return;
        }

        filtrados.forEach(opc => {
            let div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerText = opc;
            div.onmousedown = function(e) { 
                e.preventDefault(); 
                input.value = opc;
                listDiv.style.display = 'none';
                if(onSelectCallback) onSelectCallback();
            };
            listDiv.appendChild(div);
        });
        listDiv.style.display = 'block';
    }

    input.addEventListener('input', () => renderizarLista(input.value));
    input.addEventListener('focus', () => renderizarLista(input.value));
    
    input.addEventListener('blur', () => {
        listDiv.style.display = 'none';
        setTimeout(() => {
            let opcoes = getOpcoesArray();
            if(input.value && !opcoes.includes(input.value)) {
                alert("Atenção: Selecione uma opção válida da lista.");
                input.value = '';
                if(onSelectCallback) onSelectCallback();
            }
        }, 150);
    });
}

window.carregarCidades = async function() {
    let uf = document.getElementById('rom_uf').value;
    let inputCidade = document.getElementById('rom_cidade');
    inputCidade.value = ''; inputCidade.placeholder = 'Carregando cidades...';
    cidadesEstadoGlobais = [];
    if (!uf) { inputCidade.placeholder = 'Selecione o estado primeiro...'; return; }
    try {
        let res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
        let cidades = await res.json();
        inputCidade.placeholder = 'Digite a cidade da compra...';
        cidadesEstadoGlobais = cidades.map(c => c.nome);
    } catch(e) { inputCidade.placeholder = 'Erro ao carregar'; }
}

function puxarDestinosDaNuvem() {
    const qDest = query(collection(db, "destinos"), orderBy("nome", "asc"));
    onSnapshot(qDest, (snapshot) => {
        destinosGlobais = [];
        snapshot.forEach((doc) => { destinosGlobais.push(doc.data()); });
        document.getElementById('rom_fazenda_destino').placeholder = "Digite o nome da fazenda...";
    }, erroSincronizacao);
}

window.preencherDestino = function() {
    let nomeDestino = document.getElementById('rom_fazenda_destino').value;
    let f = destinosGlobais.find(dest => dest.nome === nomeDestino);
    if(f) {
        document.getElementById('rom_cidade_destino').value = f.cidade || '';
        document.getElementById('rom_uf_destino').value = f.estado || '';
    } else {
        document.getElementById('rom_cidade_destino').value = ''; 
        document.getElementById('rom_uf_destino').value = '';
    }
}

function puxarPecuaristasDaNuvem() {
    const qPec = query(collection(db, "pecuaristas"), orderBy("nome", "asc"));
    onSnapshot(qPec, (snapshot) => {
        pecuaristasGlobais = [];
        snapshot.forEach((doc) => { pecuaristasGlobais.push(doc.data()); });
        document.getElementById('rom_busca_pec').placeholder = "Digite o nome do pecuarista...";
    }, erroSincronizacao);
}

window.preencherPecuarista = function() {
    let nomeBuscado = document.getElementById('rom_busca_pec').value;
    let p = pecuaristasGlobais.find(pec => pec.nome === nomeBuscado);
    if(p) {
        document.getElementById('pec_nome').value = p.nome || ''; document.getElementById('pec_doc').value = p.documento || '';
        document.getElementById('pec_banco').value = p.banco || ''; document.getElementById('pec_agencia').value = p.agencia || '';
        document.getElementById('pec_conta').value = p.conta || '';
    } else {
        document.getElementById('pec_nome').value = ''; document.getElementById('pec_doc').value = '';
        document.getElementById('pec_banco').value = ''; document.getElementById('pec_agencia').value = '';
        document.getElementById('pec_conta').value = '';
    }
}

window.adicionarAnexosFila = function(event) {
    let files = event.target.files;
    for(let i = 0; i < files.length; i++) { arquivosFilaGlobais.push(files[i]); }
    event.target.value = ''; 
    renderizarFilaArquivos();
}

window.removerAnexoFila = function(index) {
    arquivosFilaGlobais.splice(index, 1);
    renderizarFilaArquivos();
}

function renderizarFilaArquivos() {
    let divUi = document.getElementById('lista-arquivos-ui');
    divUi.innerHTML = '';
    anexosExistentes.forEach(nome => {
        const item = document.createElement('div'); item.className = 'item-anexo';
        const texto = document.createElement('span'); texto.className = 'item-anexo-texto';
        texto.textContent = nome; item.appendChild(texto); divUi.appendChild(item);
    });
    arquivosFilaGlobais.forEach((file, index) => {
        let tamanhoMB = (file.size / (1024 * 1024)).toFixed(2);
        divUi.innerHTML += `
            <div class="item-anexo">
                <span class="item-anexo-icone"><svg class="icon icon-sm"><use href="../assets/img/icones.svg#anexo"></use></svg></span>
                <span class="item-anexo-texto"><strong>${escapeHtml(file.name)}</strong><span class="item-anexo-tamanho">${tamanhoMB} MB</span></span>
                <button type="button" class="btn-remover-anexo" onclick="removerAnexoFila(${index})" title="Remover arquivo" aria-label="Remover arquivo"><svg class="icon icon-sm"><use href="../assets/img/icones.svg#fechar"></use></svg></button>
            </div>
        `;
    });
}

window.sair = function() { signOut(auth).then(() => { localStorage.clear(); window.location.href = '../index.html'; }); }

window.verificarRacaOutra = function() {
    let select = document.getElementById('rom_raca');
    let inputOutro = document.getElementById('rom_raca_outra');
    if(select.value === 'outro') { inputOutro.style.display = 'block'; inputOutro.required = true; } 
    else { inputOutro.style.display = 'none'; inputOutro.required = false; inputOutro.value = ''; }
}

window.calcularComissao = function() {
    if (ehPesador) return;
    let tipo = document.getElementById('rom_tipo_comissao').value;
    let base = parseFloat(document.getElementById('rom_valor_comissao').value) || 0;
    let cabecas = parseInt(document.getElementById('rom_cabecas').value) || 0;
    
    let preco = parseFloat(document.getElementById('rom_preco').value) || 0;
    let unidade = document.getElementById('rom_unidade_preco').value;
    let pesoTotal = parseFloat(document.getElementById('rom_peso_total').value) || 0;
    let valorTotalGado = 0;
    
    if (preco > 0) {
        if (unidade === 'Por Kg') valorTotalGado = preco * pesoTotal;
        else if (unidade === 'Por Arroba') valorTotalGado = (pesoTotal / 30) * preco;
        else if (unidade === 'Por Cabeça') valorTotalGado = preco * cabecas;
    }

    let totalComissao = 0;
    if(tipo === 'Fixo') {
        totalComissao = base;
    } else if (tipo === 'Por Cabeça') {
        totalComissao = base * cabecas;
    } else if (tipo === '% do Romaneio') {
        totalComissao = valorTotalGado * (base / 100);
    }

    let campoTotal = document.getElementById('rom_total_comissao');
    if (totalComissao > 0) {
        campoTotal.value = totalComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } else {
        campoTotal.value = '';
    }
}

window.calcularValorTotal = function() {
    if (ehPesador) return;
    let preco = parseFloat(document.getElementById('rom_preco').value) || 0;
    let unidade = document.getElementById('rom_unidade_preco').value;
    let pesoTotal = parseFloat(document.getElementById('rom_peso_total').value) || 0;
    let cabecas = parseInt(document.getElementById('rom_cabecas').value) || 0;
    let valorTotal = 0;

    if (preco > 0) {
        if (unidade === 'Por Kg') valorTotal = preco * pesoTotal;
        else if (unidade === 'Por Arroba') valorTotal = (pesoTotal / 30) * preco;
        else if (unidade === 'Por Cabeça') valorTotal = preco * cabecas;
    }

    let campoValor = document.getElementById('rom_valor_total');
    if (valorTotal > 0) campoValor.value = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    else campoValor.value = '';

    window.calcularComissao();
}

// Destaca no menu lateral o item da tela visível
function marcarMenuAtivo(idItem) { document.querySelectorAll('.nav-item').forEach(item => { item.classList.toggle('ativa', item.id === idItem); if (item.id === idItem) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }); }

function abrirTela(id, menu) {
    ['tela-principal', 'tela-pesagem', 'tela-historico', 'tela-pendentes'].forEach(tela => {
        const el = document.getElementById(tela);
        if (el) el.style.display = tela === id ? 'block' : 'none';
    });
    marcarMenuAtivo(menu);
    window.scrollTo(0, 0);
}
window.mostrarPendentes = function() { abrirTela('tela-pendentes', 'nav-principal'); }
window.mostrarTelaPesagem = function() {
    if (!ehPesador && !pesagemEmConferencia) {
        alert('Selecione uma compra pendente para conferir a pesagem.');
        return window.mostrarPendentes();
    }
    abrirTela('tela-pesagem', 'nav-pesagem');
}
window.mostrarTelaHistorico = function() { abrirTela('tela-historico', 'nav-historico'); }
window.voltarTelaPrincipal = function() {
    if (!ehPesador && !pesagemEmConferencia) return window.mostrarPendentes();
    abrirTela('tela-principal', 'nav-principal');
}

function gerarGrelhaPesosInit() {
    let grid = document.getElementById('grid-inputs');
    grid.innerHTML = ''; totalCamposPeso = 50; let html = '';
    for(let i=1; i<=totalCamposPeso; i++) { html += `<div class="peso-box"><div class="peso-num">${i}</div><input type="number" step="0.01" class="peso-input" id="peso_ind_${i}" placeholder="kg" aria-label="Peso do animal ${i}" oninput="calcularTotaisGrid()"></div>`; }
    grid.insertAdjacentHTML('beforeend', html);
}

window.adicionarMais50 = function() {
    let inicio = totalCamposPeso + 1; totalCamposPeso += 50; 
    let grid = document.getElementById('grid-inputs'); let html = '';
    for(let i = inicio; i <= totalCamposPeso; i++) { html += `<div class="peso-box"><div class="peso-num">${i}</div><input type="number" step="0.01" class="peso-input" id="peso_ind_${i}" placeholder="kg" aria-label="Peso do animal ${i}" oninput="calcularTotaisGrid()"></div>`; }
    grid.insertAdjacentHTML('beforeend', html);
}

window.calcularTotaisGrid = function() {
    let totalPeso = 0; let totalCabecas = 0;
    for(let i=1; i<=totalCamposPeso; i++) {
        let input = document.getElementById(`peso_ind_${i}`);
        if(input && input.value && parseFloat(input.value) > 0) { totalPeso += parseFloat(input.value); totalCabecas++; }
    }
    document.getElementById('grid_lbl_cab').innerText = totalCabecas; document.getElementById('grid_lbl_peso').innerText = totalPeso.toFixed(2);
}

window.salvarPesosGrid = function() {
    let cabecas = 0; let peso = 0; pesosAdicionadosGlobais = []; 
    for(let i=1; i<=totalCamposPeso; i++) {
        let input = document.getElementById(`peso_ind_${i}`);
        if(input && input.value) {
            let val = parseFloat(input.value);
            if(val > 0) { peso += val; cabecas++; pesosAdicionadosGlobais.push(val); }
        }
    }
    document.getElementById('grid_lbl_cab').innerText = cabecas; document.getElementById('grid_lbl_peso').innerText = peso.toFixed(2);
    if(cabecas > 0) { document.getElementById('rom_cabecas').value = cabecas; document.getElementById('rom_peso_total').value = peso.toFixed(2); window.calcularValorTotal(); }
    window.voltarTelaPrincipal();
}

function lerFormulario() {
    return {
        estado: valor('rom_uf'), cidade: valor('rom_cidade'),
        fazendaDestino: valor('rom_fazenda_destino'), cidadeDestino: valor('rom_cidade_destino'), ufDestino: valor('rom_uf_destino'),
        pecuarista: valor('pec_nome'), dataCompra: valor('rom_data_compra'), dataPagamento: valor('rom_data_pag'),
        cabecas: valor('rom_cabecas'), pesoTotal: valor('rom_peso_total'), sexo: valor('rom_sexo'),
        raca: valor('rom_raca') === 'outro' ? valor('rom_raca_outra').trim() : valor('rom_raca'),
        pesosIndividuais: [...pesosAdicionadosGlobais], observacoes: valor('rom_obs'),
        anexos: [...anexosExistentes, ...arquivosFilaGlobais.map(a => a.name)],
        precoUnitario: valor('rom_preco'), unidadePreco: valor('rom_unidade_preco'), valorTotalGado: valor('rom_valor_total'),
        corretor: valor('rom_corretor'), tipoComissao: valor('rom_tipo_comissao'),
        valorComissao: valor('rom_valor_comissao'), totalComissao: valor('rom_total_comissao')
    };
}

function limparFormulario() {
    document.getElementById('form-romaneio').reset();
    pesosAdicionadosGlobais = [];
    arquivosFilaGlobais = [];
    anexosExistentes = [];
    pesagemEmConferencia = null;
    pesagemOriginal = null;
    renderizarFilaArquivos();
    gerarGrelhaPesosInit();
    window.calcularTotaisGrid();
    window.verificarRacaOutra();
    window.calcularValorTotal();
}

document.getElementById('form-romaneio').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!usuarioAtual) return;
    const btn = document.getElementById('btn-registrar');
    btn.innerText = 'Salvando registro no banco...';
    btn.disabled = true;
    try {
        window.calcularValorTotal();
        const dados = lerFormulario();
        validarPesagem(dados);
        if (!pecuaristasGlobais.some(p => p.nome === dados.pecuarista && p.nome === valor('rom_busca_pec')) ||
            !destinosGlobais.some(d => d.nome === dados.fazendaDestino)) {
            throw new Error('Selecione um pecuarista e um destino válidos.');
        }
        if (ehPesador) {
            const comprador = compradoresDisponiveis.find(c => c.uid === valor('rom_comprador'));
            if (!comprador) throw new Error('Selecione o comprador responsável.');
            await addDoc(collection(db, 'pesagens'), {
                ...dadosPesagem(dados), compradorUid: comprador.uid, comprador: comprador.nome,
                pesadorUid: usuarioAtual.uid, pesador: usuarioAtual.nome,
                status: 'aguardando_comprador', timestamp: serverTimestamp()
            });
            alert('Pesagem enviada ao comprador responsável!');
        } else {
            if (!pesagemEmConferencia) throw new Error('Selecione uma compra pendente.');
            validarNegociacao(dados);
            const origem = doc(db, 'pesagens', pesagemEmConferencia);
            const destino = doc(db, 'romaneios', pesagemEmConferencia);
            await runTransaction(db, async transacao => {
                const snap = await transacao.get(origem);
                if (!snap.exists() || snap.data().compradorUid !== usuarioAtual.uid ||
                    snap.data().status !== 'aguardando_comprador') {
                    throw new Error('Esta compra já foi validada ou não pertence a você.');
                }
                if (JSON.stringify(snap.data()) !== JSON.stringify(pesagemOriginal)) {
                    throw new Error('A pesagem foi alterada. Abra a compra novamente antes de validar.');
                }
                const pesagem = snap.data();
                transacao.set(destino, {
                    ...dados, compradorUid: usuarioAtual.uid, comprador: usuarioAtual.nome,
                    pesadorUid: pesagem.pesadorUid, pesador: pesagem.pesador, pesagemId: snap.id,
                    status: 'enviado_escritorio', timestamp: serverTimestamp(), validadoEm: serverTimestamp(),
                    ...(pesagem.anexosLinks ? { anexosLinks: pesagem.anexosLinks } : {})
                });
                // Notas e anexos da negociação ficam somente no documento financeiro.
                transacao.update(origem, { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
            });
            alert('Compra validada e enviada ao escritório!');
        }
        limparFormulario();
        if (!ehPesador) window.mostrarPendentes();
        window.scrollTo(0, 0);
    } catch(error) {
        alert('Erro ao salvar: ' + error.message);
    } finally {
        btn.innerText = textoEnviar;
        btn.disabled = false;
    }
});

function puxarCompradores() {
    const q = query(collection(db, 'usuarios'), where('perfil', '==', 'comprador'), where('aprovado', '==', true));
    onSnapshot(q, snapshot => {
        compradoresDisponiveis = snapshot.docs.map(d => ({ ...d.data(), uid: d.id }));
        compradoresDisponiveis.sort((a, b) => a.nome.localeCompare(b.nome));
        const select = document.getElementById('rom_comprador');
        const anterior = select.value;
        select.replaceChildren(new Option(compradoresDisponiveis.length ? 'Selecione...' : 'Nenhum comprador disponível', ''));
        compradoresDisponiveis.forEach(c => select.add(new Option(c.nome, c.uid)));
        select.value = anterior;
    }, erroSincronizacao);
}

function puxarPendentes() {
    const q = query(collection(db, 'pesagens'), where('compradorUid', '==', usuarioAtual.uid));
    onSnapshot(q, snapshot => {
        pesagensPendentes = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))
            .filter(p => p.status === 'aguardando_comprador')
            .sort((a, b) => (b.dataCompra || '').localeCompare(a.dataCompra || ''));
        const tbody = document.getElementById('tbody-pendentes');
        tbody.replaceChildren();
        if (!pesagensPendentes.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="celula-vazia">Nenhuma pesagem aguardando conferência.</td></tr>';
        }
        pesagensPendentes.forEach(p => {
            const tr = document.createElement('tr');
            [formatarData(p.dataCompra), p.pecuarista, p.pesador, p.fazendaDestino,
                `${p.cabecas} cbç / ${p.pesoTotal} kg`].forEach(texto => {
                const td = document.createElement('td'); td.textContent = texto || '—'; tr.appendChild(td);
            });
            const td = document.createElement('td');
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'btn btn-secundario btn-sm'; btn.textContent = 'Conferir';
            btn.onclick = () => abrirConferencia(p.id);
            td.appendChild(btn); tr.appendChild(td); tbody.appendChild(tr);
        });
    }, erroSincronizacao);
}

async function abrirConferencia(id) {
    try {
        const snap = await getDoc(doc(db, 'pesagens', id));
        if (!snap.exists() || snap.data().compradorUid !== usuarioAtual.uid || snap.data().status !== 'aguardando_comprador') {
            throw new Error('Compra indisponível para conferência.');
        }
        limparFormulario();
        const p = snap.data();
        pesagemEmConferencia = id;
        pesagemOriginal = p;
        const campos = { rom_uf: 'estado', rom_cidade: 'cidade', rom_fazenda_destino: 'fazendaDestino',
            rom_cidade_destino: 'cidadeDestino', rom_uf_destino: 'ufDestino', rom_busca_pec: 'pecuarista', pec_nome: 'pecuarista',
            rom_data_compra: 'dataCompra', rom_data_pag: 'dataPagamento', rom_cabecas: 'cabecas', rom_peso_total: 'pesoTotal',
            rom_sexo: 'sexo', rom_obs: 'observacoes' };
        // A lista de estados pode ainda estar chegando da API.
        if (![...document.getElementById('rom_uf').options].some(o => o.value === p.estado)) {
            document.getElementById('rom_uf').add(new Option(p.estado, p.estado));
        }
        Object.entries(campos).forEach(([input, campo]) => { document.getElementById(input).value = p[campo] || ''; });
        cidadesEstadoGlobais = [p.cidade];
        window.preencherPecuarista();
        document.getElementById('rom_raca').value = ['Brangus', 'Nelore', 'Cruzado'].includes(p.raca) ? p.raca : 'outro';
        window.verificarRacaOutra();
        if (valor('rom_raca') === 'outro') document.getElementById('rom_raca_outra').value = p.raca || '';
        pesosAdicionadosGlobais = [...(p.pesosIndividuais || [])];
        while (totalCamposPeso < pesosAdicionadosGlobais.length) window.adicionarMais50();
        pesosAdicionadosGlobais.forEach((peso, i) => { document.getElementById(`peso_ind_${i + 1}`).value = peso; });
        window.calcularTotaisGrid();
        anexosExistentes = [...(p.anexos || [])];
        renderizarFilaArquivos();
        window.voltarTelaPrincipal();
    } catch (error) { alert(error.message); }
}

let historicoDesteComprador = [];
function puxarHistoricoDaNuvem() {
    const q = ehPesador
        ? query(collection(db, 'pesagens'), where('pesadorUid', '==', usuarioAtual.uid))
        : query(collection(db, 'romaneios'), where('compradorUid', '==', usuarioAtual.uid));
    onSnapshot(q, snapshot => {
        historicoDesteComprador = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        historicoDesteComprador.sort((a, b) => (b.dataCompra || '').localeCompare(a.dataCompra || ''));
        window.filtrarHistorico();
    }, erroSincronizacao);
}

function formatarData(data) { return data ? data.split('-').reverse().join('/') : '—'; }
function renderizarHistorico(lista) {
    const tbody = document.getElementById('tbody-historico');
    tbody.innerHTML = '';
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="${ehPesador ? 6 : 5}" class="celula-vazia">Nenhuma compra encontrada.</td></tr>`;
        return;
    }
    lista.forEach(r => {
        tbody.innerHTML += `<tr><td class="col-data"><strong>${escapeHtml(formatarData(r.dataCompra))}</strong></td><td class="col-destaque">${escapeHtml(r.pecuarista)}</td><td>${escapeHtml(r.cidade)} - ${escapeHtml(r.estado)}</td><td>${escapeHtml(r.fazendaDestino || '—')}</td><td class="col-num"><strong>${escapeHtml(r.cabecas)}</strong> cbç <span class="texto-suave">/ ${escapeHtml(r.pesoTotal)} kg</span></td>${ehPesador ? `<td>${r.status === 'enviado_escritorio' ? 'Enviado ao escritório' : 'Aguardando comprador'}</td>` : ''}</tr>`;
    });
}
window.filtrarHistorico = function() {
    const data = valor('filtro_data');
    const mes = valor('filtro_mes');
    let lista = historicoDesteComprador;
    if(data) { document.getElementById('filtro_mes').value = ''; lista = lista.filter(r => r.dataCompra === data); }
    else if(mes) lista = lista.filter(r => r.dataCompra?.startsWith(mes));
    renderizarHistorico(lista);
}
window.limparFiltrosHistorico = function() {
    document.getElementById('filtro_data').value = '';
    document.getElementById('filtro_mes').value = '';
    renderizarHistorico(historicoDesteComprador);
}
