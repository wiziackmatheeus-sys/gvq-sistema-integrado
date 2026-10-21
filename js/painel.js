import { comPrazo } from './controle-envio.js';
import { criarRascunhoLocal } from './rascunho-local.js';
import { compararNomes, normalizarTexto, buscarCompras } from './buscas.js';
import { montarCamposDocumentos, atualizarSituacaoDocumentos, nomeDocumento } from './documentos.js';
import { gerarCodigoCompra, reservarNumeroCompra, executarNumeracao } from './codigo-compra.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, query, where, orderBy, serverTimestamp, doc, runTransaction, getDoc, getDocsFromServer, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { enviarAnexos, limparUploads, unirAnexos } from './anexos.js';
import { criarControleSessao } from './sessao.js';
import { exigirPerfil } from "./auth-guard.js";
import { dadosPesagem, validarPesagem, validarNegociacao, pesoMedio, pesagemFoiAlterada, escapeHtml } from "./fluxo-compra.js";

let pecuaristasGlobais = [];
let destinosGlobais = [];
let cidadesEstadoGlobais = [];
let pesosAdicionadosGlobais = []; 
let totalCamposPeso = 50; 
let nomeCompradorLogado = "";
let arquivosFilaGlobais = [];
const ehPesador = document.body.dataset.perfil === 'pesador';
let usuarioAtual = null;
let rascunho = null;
let envioEmAndamento = false;
let rascunhoPronto = false;
let bloqueioRascunho = false;
let envioPesadorId = null;
const confirmarGravacao = operacao => comPrazo(operacao,
    'Não foi possível confirmar o envio ao banco. O preenchimento foi preservado. Confira a conexão e o histórico antes de tentar novamente.',
    { ms: 45000, resultadoIncerto: true });
const formulario = document.getElementById('form-romaneio');

function informarRascunho(texto, erro = false) {
    const el = document.getElementById('situacao-rascunho');
    if (!el) return;
    el.textContent = texto;
    el.classList.toggle('rascunho-erro', erro);
}
function salvarRascunhoAutomatico() {
    if (ehPesador && rascunhoPronto && !envioEmAndamento && auth.currentUser?.uid === usuarioAtual?.uid) {
        rascunho?.salvar().catch(() => {});
    }
}
function capturarRascunho() {
    const campos = {};
    formulario.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
        if (el.type !== 'file' && el.id !== 'rom_originador') campos[el.id] = el.value;
    });
    return { campos, pesosConfirmados: [...pesosAdicionadosGlobais],
        grade: Array.from(document.querySelectorAll('#grid-inputs input'), el => el.value),
        arquivos: arquivosFilaGlobais.map(a => ({ ...a })) };
}
async function restaurarRascunho(dados) {
    if (!dados || !dados.campos || !Array.isArray(dados.grade) || !Array.isArray(dados.pesosConfirmados) || !Array.isArray(dados.arquivos)) throw new Error('Não foi possível ler o rascunho.');
    formulario.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
        if (el.type === 'file' || el.id === 'rom_originador' || typeof dados.campos[el.id] !== 'string') return;
        if (el.id === 'rom_uf' && dados.campos[el.id] && !Array.from(el.options).some(o => o.value === dados.campos[el.id])) el.add(new Option(dados.campos[el.id], dados.campos[el.id]));
        el.value = dados.campos[el.id];
    });
    while (totalCamposPeso < dados.grade.length) window.adicionarMais50();
    dados.grade.forEach((peso, i) => { document.getElementById(`peso_ind_${i + 1}`).value = peso; });
    pesosAdicionadosGlobais = [...dados.pesosConfirmados];
    arquivosFilaGlobais = dados.arquivos;
    window.verificarRacaOutra(); window.calcularTotaisGrid(); window.calcularValorTotal(); renderizarFilaArquivos();
    if (valor('rom_uf')) window.carregarCidades(true);
}
async function iniciarRascunho(sessaoValida) {
    const uid = usuarioAtual.uid;
    rascunhoPronto = false; rascunho?.encerrar();
    formulario.inert = true;
    document.getElementById('grid-inputs').inert = true;
    try {
        const controle = await criarRascunhoLocal({ uid, capturar: capturarRascunho,
            restaurar: dados => { if (sessaoValida() && auth.currentUser?.uid === uid) return restaurarRascunho(dados); },
            informar: (texto, erro) => { if (sessaoValida()) informarRascunho(texto, erro); } });
        if (!sessaoValida()) { controle.encerrar(); return; }
        rascunho = controle;
        rascunhoPronto = true;
    } catch (error) { informarRascunho('O salvamento de rascunho está indisponível. ' + error.message, true); }
    finally { formulario.inert = false; document.getElementById('grid-inputs').inert = false; }
}
if (ehPesador) {
    document.addEventListener('input', e => { if (formulario.contains(e.target) || document.getElementById('grid-inputs').contains(e.target)) salvarRascunhoAutomatico(); });
    formulario.addEventListener('change', salvarRascunhoAutomatico);
    document.addEventListener('visibilitychange', () => { if (document.hidden) salvarRascunhoAutomatico(); });
    window.addEventListener('pagehide', salvarRascunhoAutomatico);
    document.getElementById('btn-salvar-rascunho').onclick = () => salvarRascunhoAutomatico();
    document.getElementById('btn-descartar-rascunho').onclick = async () => {
        if (!rascunhoPronto || envioEmAndamento || !confirm('Descartar o rascunho deste aparelho e limpar o preenchimento?')) return;
        envioEmAndamento = true; formulario.inert = true; document.getElementById('grid-inputs').inert = true;
        try { await rascunho.apagar(); limparFormulario(); }
        catch { /* O formulário é preservado se a exclusão falhar. */ }
        finally { envioEmAndamento = false; formulario.inert = false; document.getElementById('grid-inputs').inert = false; }
    };
}
let anexosLinksExistentes = [];
let complementoId = null;
let documentosComplemento = [];
let pesagensPendentes = [];
let pesagemEmConferencia = null;
let pesagemOriginal = null;
let anexosExistentes = [];
const textoEnviar = ehPesador ? 'Enviar ao originador' : 'Validar e enviar ao escritório';
const valor = id => document.getElementById(id)?.value || '';
const erroSincronizacao = error => alert('Não foi possível carregar os dados: ' + error.message);
const sessao = criarControleSessao(erroSincronizacao);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const sessaoValida = sessao.iniciar();
        usuarioAtual = await exigirPerfil(user, [ehPesador ? 'pesador' : 'originador'], sessaoValida);
        if (!usuarioAtual || !sessaoValida()) return;
        nomeCompradorLogado = usuarioAtual.nome;
        document.getElementById('nome-usuario').innerText = 'Olá, ' + nomeCompradorLogado.split(' ')[0];
        
        gerarGrelhaPesosInit();
        if (ehPesador) await iniciarRascunho(sessaoValida);
        if (!sessaoValida()) return;
        
        // INICIALIZA OS AUTOCOMPLETES VERTICAIS
        configurarAutocomplete('rom_cidade', 'lista_cidades_ui', () => cidadesEstadoGlobais, () => {});
        configurarAutocomplete('rom_fazenda_destino', 'lista_destinos_ui', () => destinosGlobais.map(d => d.nome), window.preencherDestino);
        configurarAutocomplete('rom_busca_pec', 'lista_pecuaristas_ui', () => pecuaristasGlobais.map(p => p.nome), window.preencherPecuarista);

        try {
            let res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
            let estados = await res.json();
            let ufSelect = document.getElementById('rom_uf');
            estados.sort((a,b) => compararNomes(a.sigla,b.sigla)).forEach(e => {
                const existente = Array.from(ufSelect.options).find(o => o.value === e.sigla);
                if (existente) existente.textContent = e.nome; else ufSelect.add(new Option(e.nome, e.sigla));
            });
        } catch(e) { console.log('Erro IBGE'); }

        if (!sessaoValida()) return;
        puxarPecuaristasDaNuvem();
        puxarDestinosDaNuvem(); 
        puxarHistoricoDaNuvem();
        if (ehPesador) document.getElementById('rom_originador').value = usuarioAtual.comprador;
        else { puxarPendentes(); window.mostrarPendentes(); }
    } else {
        rascunhoPronto = false; rascunho?.encerrar();
        sessao.encerrar();
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
        let opcoes = [...new Set(getOpcoesArray())].sort(compararNomes);
        listDiv.innerHTML = '';
        
        let filtrados = opcoes.filter(o => normalizarTexto(o).includes(normalizarTexto(filtro)));
        
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
                salvarRascunhoAutomatico();
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
            let opcoes = [...new Set(getOpcoesArray())].sort(compararNomes);
            if(input.value && !opcoes.includes(input.value)) {
                alert("Atenção: Selecione uma opção válida da lista.");
                input.value = '';
                if(onSelectCallback) onSelectCallback();
                salvarRascunhoAutomatico();
            }
        }, 150);
    });
}

window.carregarCidades = async function(preservar = false) {
    let uf = document.getElementById('rom_uf').value;
    let inputCidade = document.getElementById('rom_cidade');
    if (!preservar) inputCidade.value = '';
    inputCidade.placeholder = 'Carregando cidades...';
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
    sessao.observar(qDest, (snapshot) => {
        destinosGlobais = [];
        snapshot.forEach((doc) => { destinosGlobais.push(doc.data()); });
        document.getElementById('rom_fazenda_destino').placeholder = "Digite o nome da fazenda...";
        if (ehPesador && destinosGlobais.some(d => d.nome === valor('rom_fazenda_destino'))) window.preencherDestino();
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
    sessao.observar(qPec, (snapshot) => {
        pecuaristasGlobais = [];
        snapshot.forEach((doc) => { pecuaristasGlobais.push(doc.data()); });
        document.getElementById('rom_busca_pec').placeholder = "Digite o nome do pecuarista...";
        if (ehPesador && pecuaristasGlobais.some(p => p.nome === valor('rom_busca_pec'))) window.preencherPecuarista();
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
    for(let i = 0; i < files.length; i++) { arquivosFilaGlobais.push({ arquivo: files[i], categoria: event.target.dataset.categoria || 'outros' }); }
    event.target.value = ''; 
    renderizarFilaArquivos();
    salvarRascunhoAutomatico();
}

window.removerAnexoFila = function(index) {
    arquivosFilaGlobais.splice(index, 1);
    renderizarFilaArquivos();
    salvarRascunhoAutomatico();
}

function renderizarFilaArquivos() {
    let divUi = document.getElementById('lista-arquivos-ui');
    divUi.innerHTML = '';
    const existentes = [...anexosLinksExistentes, ...anexosExistentes.filter(nome => !anexosLinksExistentes.some(a => a.nomeArquivo === nome)).map(nomeArquivo => ({ nomeArquivo }))];
    existentes.forEach(anexo => {
        const nome = anexo.nomeArquivo;
        const item = document.createElement('div'); item.className = 'item-anexo';
        const texto = document.createElement('span'); texto.className = 'item-anexo-texto';
        texto.textContent = nomeDocumento(anexo) + ': ' + nome + (anexo.somenteTexto ? ' (somente nome)' : ''); item.appendChild(texto);
        if (anexo) { const link = criarLinkAnexo(anexo); if (link) item.appendChild(link); }
        divUi.appendChild(item);
    });
    arquivosFilaGlobais.forEach((entrada, index) => {
        const file = entrada.arquivo;
        let tamanhoMB = (file.size / (1024 * 1024)).toFixed(2);
        divUi.innerHTML += `
            <div class="item-anexo">
                <span class="item-anexo-icone"><svg class="icon icon-sm"><use href="../assets/img/icones.svg#anexo"></use></svg></span>
                <span class="item-anexo-texto"><strong>${escapeHtml(nomeDocumento(entrada))}: ${escapeHtml(file.name)}</strong><span class="item-anexo-tamanho">${tamanhoMB} MB</span></span>
                <button type="button" class="btn-remover-anexo" onclick="removerAnexoFila(${index})" title="Remover arquivo" aria-label="Remover arquivo"><svg class="icon icon-sm"><use href="../assets/img/icones.svg#fechar"></use></svg></button>
            </div>
        `;
    });
    atualizarSituacaoDocumentos('campos-documentos', [...existentes, ...arquivosFilaGlobais]);
}

window.sair = async function() {
    if (envioEmAndamento) return;
    if (ehPesador && rascunhoPronto) {
        try { await rascunho.salvar(); }
        catch { if (!confirm('Não foi possível salvar o rascunho. Deseja sair mesmo assim?')) return; }
    }
    await sessao.sair();
};

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
    campoTotal.value = totalComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

window.calcularValorTotal = function() {
    const media = pesoMedio(valor('rom_cabecas'), valor('rom_peso_total'));
    document.getElementById('rom_peso_medio').value = media === null ? '' : media.toFixed(2);
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
    ['tela-principal', 'tela-pesagem', 'tela-historico', 'tela-pendentes', 'tela-documentos'].forEach(tela => {
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
    document.getElementById('rom_tipo_pesagem').value = cabecas > 0 ? 'individual' : 'balancao';
    document.getElementById('rom_cabecas').value = cabecas || '';
    document.getElementById('rom_peso_total').value = cabecas > 0 ? peso.toFixed(2) : '';
    window.calcularValorTotal();
    window.voltarTelaPrincipal();
    salvarRascunhoAutomatico();
}

window.ajustarTipoPesagem = function() {
    if (valor('rom_tipo_pesagem') === 'balancao') {
        pesosAdicionadosGlobais = [];
        gerarGrelhaPesosInit();
        window.calcularTotaisGrid();
    }
    window.calcularValorTotal();
    salvarRascunhoAutomatico();
}

function lerFormulario() {
    return {
        estado: valor('rom_uf'), cidade: valor('rom_cidade'),
        fazendaDestino: valor('rom_fazenda_destino'), cidadeDestino: valor('rom_cidade_destino'), ufDestino: valor('rom_uf_destino'),
        pecuarista: valor('pec_nome'), pecuaristaDocumento: valor('pec_doc'), pecuaristaBanco: valor('pec_banco'),
        pecuaristaAgencia: valor('pec_agencia'), pecuaristaConta: valor('pec_conta'),
        pesoMedio: valor('rom_peso_medio'), tipoPesagem: valor('rom_tipo_pesagem'), dataCompra: valor('rom_data_compra'), dataPagamento: valor('rom_data_pag'),
        cabecas: valor('rom_cabecas'), pesoTotal: valor('rom_peso_total'), sexo: valor('rom_sexo'),
        raca: valor('rom_raca') === 'outro' ? valor('rom_raca_outra').trim() : valor('rom_raca'),
        pesosIndividuais: [...pesosAdicionadosGlobais], observacoes: valor('rom_obs'),
        anexos: [...anexosExistentes, ...arquivosFilaGlobais.map(a => a.arquivo.name)],
        precoUnitario: valor('rom_preco'), unidadePreco: valor('rom_unidade_preco'), valorTotalGado: valor('rom_valor_total'),
        corretor: valor('rom_corretor'), tipoComissao: valor('rom_tipo_comissao'),
        valorComissao: valor('rom_valor_comissao'), totalComissao: valor('rom_total_comissao')
    };
}

function limparFormulario() {
    envioPesadorId = null;
    document.getElementById('form-romaneio').reset();
    pesosAdicionadosGlobais = [];
    arquivosFilaGlobais = [];
    anexosExistentes = [];
    anexosLinksExistentes = [];
    if (ehPesador) document.getElementById('rom_originador').value = usuarioAtual.comprador;
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
    if (!usuarioAtual || envioEmAndamento) return;
    envioEmAndamento = true;
    formulario.inert = true;
    document.getElementById('grid-inputs').inert = true;
    const btn = document.getElementById('btn-registrar');
    const informarEnvio = texto => { btn.innerText = texto; };
    informarEnvio('Conferindo dados da compra...'); btn.disabled = true;
    let enviados = [];
    let gravado = false;
    try {
        window.calcularValorTotal();
        const dados = lerFormulario();
        validarPesagem(dados);
        if (!pecuaristasGlobais.some(p => p.nome === dados.pecuarista && p.nome === valor('rom_busca_pec')) ||
            !destinosGlobais.some(d => d.nome === dados.fazendaDestino && d.cidade === dados.cidadeDestino && d.estado === dados.ufDestino)) {
            throw new Error('Selecione um pecuarista e um destino válidos.');
        }
        if (ehPesador) {
            // Conferir novamente o vínculo antes de enviar; não confiar no perfil carregado ao entrar.
            informarEnvio('Conferindo originador responsável...');
            const perfil = await comPrazo(getDoc(doc(db, 'usuarios', usuarioAtual.uid)), 'O banco não respondeu ao conferir seu cadastro. Confira a conexão e tente novamente.');
            const responsavel = perfil.data();
            if (!responsavel?.aprovado || !responsavel.compradorUid) throw new Error('Aguarde o escritório aprovar seu cadastro e designar o originador.');
            // O mesmo ID é reutilizado em uma repetição após falha de conexão.
            const origem = rascunho ? doc(db, 'pesagens', rascunho.id) : doc(db, 'pesagens', envioPesadorId ||= doc(collection(db, 'pesagens')).id);
            informarEnvio('Conferindo envio anterior...');
            // Consultar o próprio histórico é permitido mesmo antes de a compra existir.
            // Uma consulta pelo __name__ de um documento inexistente é negada pelas regras.
            const historico = await comPrazo(getDocsFromServer(query(collection(db, 'pesagens'), where('pesadorUid', '==', usuarioAtual.uid))), 'O banco não respondeu ao conferir o envio anterior. Tente novamente quando a conexão voltar.');
            const anteriores = historico.docs.filter(d => d.id === origem.id);
            if (anteriores.some(d => d.metadata?.hasPendingWrites)) throw Object.assign(new Error('Existe um envio aguardando confirmação. Confira a conexão e o histórico antes de tentar novamente.'), { resultadoIncerto: true });
            if (anteriores.length > 0) {
                if (!confirm('Esta pesagem já foi enviada. Consulte o histórico. Deseja descartar este rascunho e iniciar outro preenchimento?')) return;
                gravado = true;
                if (rascunho) await comPrazo(rascunho.apagar(), 'Não foi possível limpar o rascunho neste aparelho.', { ms: 5000 });
                limparFormulario();
                alert('Esta pesagem já foi enviada. Confira o histórico.');
                return;
            }
            if (rascunhoPronto) { try { await comPrazo(rascunho.salvar(), 'Rascunho local sem resposta.', { ms: 5000 }); } catch { /* O envio ao servidor pode continuar. */ } }
            enviados = await enviarAnexos(arquivosFilaGlobais, { uid: usuarioAtual.uid, pesagemId: origem.id, aoProgresso: informarEnvio });
            informarEnvio('Confirmando compra no banco...');
            await confirmarGravacao(setDoc(origem, {
                ...dadosPesagem(dados), anexosLinks: enviados, anexosCaminhos: enviados.map(a => a.caminho),
                compradorUid: responsavel.compradorUid, comprador: responsavel.comprador,
                pesadorUid: usuarioAtual.uid, pesador: usuarioAtual.nome,
                status: 'aguardando_comprador', revisao: 1, timestamp: serverTimestamp()
            }));
            gravado = true;
            usuarioAtual = { ...usuarioAtual, ...responsavel };
            alert('Pesagem enviada ao originador responsável!');
        } else {
            if (!pesagemEmConferencia) throw new Error('Selecione uma compra pendente.');
            validarNegociacao(dados);
            const origem = doc(db, 'pesagens', pesagemEmConferencia);
            const destino = doc(db, 'romaneios', pesagemEmConferencia);
            const evento = doc(collection(db, 'romaneios', origem.id, 'historicoEscritorio'));
            enviados = await enviarAnexos(arquivosFilaGlobais, { uid: usuarioAtual.uid, pesagemId: origem.id, financeiro: true, aoProgresso: informarEnvio });
            informarEnvio('Confirmando validação no banco...');
            const contador = doc(db, 'contadores', 'compras');
            await confirmarGravacao(executarNumeracao(leitura => runTransaction(db, async transacao => {
                const snap = await transacao.get(origem);
                if (!snap.exists() || snap.data().compradorUid !== usuarioAtual.uid || snap.data().status !== 'aguardando_comprador') {
                    throw new Error('Esta compra já foi validada ou não pertence a você.');
                }
                if (pesagemFoiAlterada(pesagemOriginal, snap.data())) throw new Error('O registro foi atualizado. Abra a compra novamente para conferir os dados e documentos.');
                const pesagem = snap.data();
                const anterior = pesagem.validadoEm ? await transacao.get(destino) : null;
                const codigoCompra = anterior?.data()?.codigoCompra || gerarCodigoCompra(dados, origem.id);
                const numeroCompra = await reservarNumeroCompra(transacao, contador, anterior?.data(), origem.id, leitura);
                transacao.set(destino, {
                    ...dados, codigoCompra, numeroCompra, anexosLinks: unirAnexos(anexosLinksExistentes, enviados),
                    anexosCaminhos: unirAnexos(anexosLinksExistentes, enviados).map(a => a.caminho).filter(Boolean),
                    compradorUid: usuarioAtual.uid, comprador: usuarioAtual.nome,
                    pesadorUid: pesagem.pesadorUid, pesador: pesagem.pesador, pesagemId: snap.id,
                    revisaoValidada: pesagem.revisao || 1,
                    status: 'enviado_escritorio', timestamp: serverTimestamp(), validadoEm: serverTimestamp(),
                    etapaEscritorio: 'recebida', responsavelEscritorioUid: null, responsavelEscritorio: null,
                    finalizadoPorUid: null, finalizadoPor: null, finalizadoEm: null,
                    etapaAtualizadaEm: serverTimestamp(), etapaAtualizadaPorUid: usuarioAtual.uid,
                    ultimoEventoEscritorio: evento.id
                });
                transacao.set(evento, { tipo: 'validacao_originador', etapa: 'recebida', etapaAnterior: null,
                    usuarioUid: usuarioAtual.uid, usuario: usuarioAtual.nome, revisao: pesagem.revisao || 1, quando: serverTimestamp() });
                transacao.update(origem, { status: 'enviado_escritorio', validadoEm: serverTimestamp() });
            }), async () => (await getDoc(contador)).data()?.valor || 0));
            gravado = true;
            alert('Compra validada e enviada ao escritório!');
        }
        if (ehPesador && rascunho) {
            try { await comPrazo(rascunho.apagar(), 'Rascunho local sem resposta.', { ms: 5000 }); }
            catch { informarRascunho('Compra enviada. Não foi possível limpar o rascunho; reabra a página antes de iniciar outra compra.', true); rascunhoPronto = false; bloqueioRascunho = true; }
        }
        limparFormulario();
        if (!ehPesador) window.mostrarPendentes();
        window.scrollTo(0, 0);
    } catch(error) {
        if (!gravado && !error.resultadoIncerto) await limparUploads(enviados);
        alert('Erro ao salvar: ' + error.message);
    } finally {
        btn.innerText = textoEnviar; btn.disabled = bloqueioRascunho; envioEmAndamento = false;
        formulario.inert = bloqueioRascunho; document.getElementById('grid-inputs').inert = bloqueioRascunho;
    }
});

function puxarPendentes() {
    const q = query(collection(db, 'pesagens'), where('compradorUid', '==', usuarioAtual.uid));
    sessao.observar(q, snapshot => {
        pesagensPendentes = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))
            .filter(p => p.status === 'aguardando_comprador')
            .sort((a, b) => (b.dataCompra || '').localeCompare(a.dataCompra || ''));
        window.filtrarPendentes();
    }, erroSincronizacao);
}
window.filtrarPendentes = function() {
    const lista = buscarCompras(pesagensPendentes, { texto:valor('pendente-busca'), mes:valor('pendente-mes'), tipo:valor('pendente-tipo') });
    const tbody = document.getElementById('tbody-pendentes');
    tbody.replaceChildren();
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="celula-vazia">Nenhuma pesagem aguardando conferência.</td></tr>';
    }
    lista.forEach(p => {
        const tr = document.createElement('tr');
        [formatarData(p.dataCompra), p.pecuarista, p.pesador, p.fazendaDestino,
            `${p.cabecas} cabeças / ${p.pesoTotal} kg`].forEach(texto => {
            const td = document.createElement('td'); td.textContent = texto || '—'; tr.appendChild(td);
        });
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-secundario btn-sm'; btn.textContent = p.validadoEm ? 'Revalidar' : 'Conferir';
        btn.onclick = () => abrirConferencia(p.id);
        td.appendChild(btn);
        if (p.complementadoEm) {
            const tag = document.createElement('span'); tag.className = 'tag tag-alerta'; tag.textContent = 'Novos documentos';
            td.appendChild(document.createTextNode(' ')); td.appendChild(tag);
        }
        tr.appendChild(td); tbody.appendChild(tr);
    });
};
window.limparFiltrosPendentes = function() {
    ['pendente-busca','pendente-mes','pendente-tipo'].forEach(id => { document.getElementById(id).value = ''; }); window.filtrarPendentes();
};

async function abrirConferencia(id) {
    try {
        const snap = await getDoc(doc(db, 'pesagens', id));
        if (!snap.exists() || snap.data().compradorUid !== usuarioAtual.uid || snap.data().status !== 'aguardando_comprador') {
            throw new Error('Compra indisponível para conferência.');
        }
        limparFormulario();
        const p = snap.data();
        let anterior = {};
        if (p.validadoEm) {
            const financeiro = await getDoc(doc(db, 'romaneios', id));
            if (financeiro.exists()) anterior = financeiro.data();
        }
        const formulario = { ...p, ...anterior };
        pesagemEmConferencia = id;
        pesagemOriginal = p;
        const campos = { rom_uf: 'estado', rom_cidade: 'cidade', rom_fazenda_destino: 'fazendaDestino',
            rom_cidade_destino: 'cidadeDestino', rom_uf_destino: 'ufDestino', rom_busca_pec: 'pecuarista', pec_nome: 'pecuarista',
            rom_data_compra: 'dataCompra', rom_data_pag: 'dataPagamento', rom_cabecas: 'cabecas', rom_peso_total: 'pesoTotal',
            rom_sexo: 'sexo', rom_obs: 'observacoes', rom_preco: 'precoUnitario', rom_unidade_preco: 'unidadePreco',
            rom_corretor: 'corretor', rom_tipo_comissao: 'tipoComissao', rom_valor_comissao: 'valorComissao' };
        // A lista de estados pode ainda estar chegando da API.
        if (![...document.getElementById('rom_uf').options].some(o => o.value === p.estado)) {
            document.getElementById('rom_uf').add(new Option(p.estado, p.estado));
        }
        Object.entries(campos).forEach(([input, campo]) => { if (formulario[campo] !== undefined) document.getElementById(input).value = formulario[campo]; });
        cidadesEstadoGlobais = [formulario.cidade];
        window.preencherPecuarista();
        document.getElementById('rom_raca').value = ['Brangus', 'Nelore', 'Cruzado', 'F1 Angus', 'Europeu'].includes(formulario.raca) ? formulario.raca : 'outro';
        window.verificarRacaOutra();
        if (valor('rom_raca') === 'outro') document.getElementById('rom_raca_outra').value = formulario.raca || '';
        pesosAdicionadosGlobais = [...(formulario.pesosIndividuais || [])];
        while (totalCamposPeso < pesosAdicionadosGlobais.length) window.adicionarMais50();
        pesosAdicionadosGlobais.forEach((peso, i) => { document.getElementById(`peso_ind_${i + 1}`).value = peso; });
        window.calcularTotaisGrid();
        document.getElementById('rom_tipo_pesagem').value = formulario.tipoPesagem || (pesosAdicionadosGlobais.length ? 'individual' : 'balancao');
        anexosLinksExistentes = unirAnexos(anterior.anexosLinks || [], p.anexosLinks || []);
        anexosExistentes = [...new Set([...(anterior.anexos || []), ...(p.anexos || [])])];
        window.calcularValorTotal();
        renderizarFilaArquivos();
        window.voltarTelaPrincipal();
    } catch (error) { alert(error.message); }
}

let historicoDesteComprador = [];
function puxarHistoricoDaNuvem() {
    const q = ehPesador
        ? query(collection(db, 'pesagens'), where('pesadorUid', '==', usuarioAtual.uid))
        : query(collection(db, 'romaneios'), where('compradorUid', '==', usuarioAtual.uid));
    sessao.observar(q, snapshot => {
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
        tbody.innerHTML = `<tr><td colspan="${ehPesador ? 7 : 5}" class="celula-vazia">Nenhuma compra encontrada.</td></tr>`;
        return;
    }
    lista.forEach(r => {
        tbody.innerHTML += `<tr><td class="col-data"><strong>${escapeHtml(formatarData(r.dataCompra))}</strong></td><td class="col-destaque">${escapeHtml(r.pecuarista)}</td><td>${escapeHtml(r.cidade)} - ${escapeHtml(r.estado)}</td><td>${escapeHtml(r.fazendaDestino || '—')}</td><td class="col-num"><strong>${escapeHtml(r.cabecas)}</strong> cabeças <span class="texto-suave">/ ${escapeHtml(r.pesoTotal)} kg</span></td>${ehPesador ? `<td>${r.status === 'enviado_escritorio' ? 'Enviado ao escritório' : 'Aguardando originador'}</td>` : ''}${ehPesador ? '<td class="col-documentos"></td>' : ''}</tr>`;
        if (ehPesador) {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-secundario btn-sm';
            btn.textContent = 'Anexar documentos'; btn.onclick = () => abrirComplementos(r.id);
            tbody.lastElementChild.querySelector('.col-documentos').appendChild(btn);
        }
    });
}
window.filtrarHistorico = function(origem) {
    if (origem === 'data') document.getElementById('filtro_mes').value = '';
    if (origem === 'mes') document.getElementById('filtro_data').value = '';
    const lista = buscarCompras(historicoDesteComprador, { texto:valor('filtro_busca'), data:valor('filtro_data'), mes:valor('filtro_mes'), status:valor('filtro_situacao') });
    renderizarHistorico(lista);
};
window.limparFiltrosHistorico = function() {
    ['filtro_data','filtro_mes','filtro_busca','filtro_situacao'].forEach(id => { document.getElementById(id).value = ''; }); window.filtrarHistorico();
};

function criarLinkAnexo(anexo) {
    if (anexo.somenteTexto) return null;
    try {
        if (new URL(anexo.urlDownload).protocol !== 'https:') return null;
        const link = document.createElement('a'); link.href = anexo.urlDownload; link.target = '_blank';
        link.rel = 'noopener noreferrer'; link.className = 'btn btn-secundario btn-sm'; link.textContent = 'Abrir';
        return link;
    } catch { return null; }
}
async function abrirComplementos(id) {
    try {
        const snap = await getDoc(doc(db, 'pesagens', id));
        if (!snap.exists() || snap.data().pesadorUid !== usuarioAtual.uid) throw new Error('Pesagem não encontrada.');
        complementoId = id;
        document.getElementById('form-complementos').reset();
        document.getElementById('lista-complementos').replaceChildren();
        documentosComplemento = snap.data().anexosLinks || [];
        atualizarSituacaoDocumentos('campos-complementos', documentosComplemento);
        document.getElementById('complemento-pecuarista').textContent = snap.data().pecuarista;
        const lista = document.getElementById('documentos-existentes'); lista.replaceChildren();
        (snap.data().anexosLinks || []).forEach(anexo => {
            const linha = document.createElement('div'); linha.className = 'item-anexo';
            const texto = document.createElement('span'); texto.className = 'item-anexo-texto'; texto.textContent = nomeDocumento(anexo) + ': ' + anexo.nomeArquivo + (anexo.somenteTexto ? ' (somente nome)' : '');
            linha.appendChild(texto); const link = criarLinkAnexo(anexo); if (link) linha.appendChild(link); lista.appendChild(linha);
        });
        abrirTela('tela-documentos', 'nav-historico');
    } catch (error) { alert(error.message); }
}
function arquivosComplementares() {
    return [...document.querySelectorAll('#campos-complementos input[type=file]')]
        .flatMap(input => [...input.files].map(arquivo => ({ arquivo, categoria: input.dataset.categoria })));
}
window.listarComplementos = function() {
    atualizarSituacaoDocumentos('campos-complementos', [...documentosComplemento, ...arquivosComplementares()]);
    const lista = document.getElementById('lista-complementos'); lista.replaceChildren();
    arquivosComplementares().forEach(entrada => {
        const item = document.createElement('div'); item.className = 'item-anexo';
        item.textContent = nomeDocumento(entrada) + ': ' + entrada.arquivo.name; lista.appendChild(item);
    });
}
if (ehPesador) document.getElementById('form-complementos').addEventListener('submit', async e => {
    e.preventDefault();
    const arquivos = arquivosComplementares();
    if (!arquivos.length) return alert('Selecione pelo menos um documento para complementar.');
    const btn = document.getElementById('btn-complementar'); btn.disabled = true; btn.textContent = 'Enviando...';
    let enviados = []; let gravado = false;
    try {
        const id = complementoId;
        enviados = await enviarAnexos(arquivos, { uid: usuarioAtual.uid, pesagemId: id, aoProgresso: texto => { btn.textContent = texto; } });
        btn.textContent = 'Confirmando documentos no banco...';
        await confirmarGravacao(runTransaction(db, async transacao => {
            const origem = doc(db, 'pesagens', id);
            const snap = await transacao.get(origem);
            if (!snap.exists() || snap.data().pesadorUid !== usuarioAtual.uid) throw new Error('Pesagem indisponível.');
            const p = snap.data();
            transacao.update(origem, {
                anexosLinks: unirAnexos(p.anexosLinks || [], enviados),
                anexosCaminhos: [...(p.anexosCaminhos || []), ...enviados.map(a => a.caminho)], anexos: [...(p.anexos || []), ...enviados.map(a => a.nomeArquivo)],
                revisao: (p.revisao || 1) + 1, status: 'aguardando_comprador', complementadoEm: serverTimestamp()
            });
            if (p.validadoEm) transacao.update(doc(db, 'romaneios', id), { status: 'aguardando_revalidacao', revalidacaoSolicitadaEm: serverTimestamp() });
        }));
        gravado = true;
        alert('Documentos enviados. A compra voltou para validação do originador.');
        complementoId = null; window.mostrarTelaHistorico();
    } catch (error) { if (!gravado && !error.resultadoIncerto) await limparUploads(enviados); alert('Erro ao complementar: ' + error.message); }
    finally { btn.disabled = false; btn.textContent = 'Enviar para revalidação'; }
});

montarCamposDocumentos('campos-documentos', 'input_arquivos', window.adicionarAnexosFila);
if (ehPesador) montarCamposDocumentos('campos-complementos', 'input_complementos', window.listarComplementos);





