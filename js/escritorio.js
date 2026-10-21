import { atualizarUsuarios, limparCredenciais } from './usuarios-escritorio.js';
import { compararNomes, aplicarBuscaTabela } from './buscas.js';
import { filtrarCompras } from './filtros-compras.js';
import { tiposDocumento, categoriaDocumento } from './documentos.js';
import { codigoDaCompra, temNumeroCompra, reservarNumeroCompra, executarNumeracao } from './codigo-compra.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, query, orderBy, serverTimestamp, doc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { criarControleSessao } from './sessao.js';
import { etapasEscritorio, etapaAtual, podeMudarEtapa } from './etapas-escritorio.js';
import { exigirPerfil } from "./auth-guard.js";
import { escapeHtml, pesoMedio } from "./fluxo-compra.js";

let pecuaristasGlobais = [];
let destinosGlobais = [];
let romaneiosGlobais = [];
let usuarioEscritorio = null;
let cancelarHistorico = null;
const numeracoesEmAndamento = new Set();
const sessao = criarControleSessao(error => alert('Não foi possível carregar os dados: ' + error.message));

const bancosBrasileiros = [
    "BANCO DO BRASIL S.A. - 001", "CAIXA ECONÔMICA FEDERAL - 104", "BANCO BRADESCO S.A. - 237",
    "ITAÚ UNIBANCO S.A. - 341", "BANCO SANTANDER (BRASIL) S.A. - 033", "BANCO SICOOB S.A. - 756",
    "BANCO SICREDI S.A. - 748", "NUBANK - 260", "BANCO INTER S.A. - 077", "C6 BANK - 336",
    "BANCO BTG PACTUAL S.A. - 208", "BANCO SAFRA S.A. - 422", "BANCO ORIGINAL S.A. - 212",
    "BANCO PAN S.A. - 623", "BANCO MERCANTIL DO BRASIL S.A. - 389", "BANCO NORDESTE DO BRASIL S.A. - 004",
    "BANCO DA AMAZÔNIA S.A. - 003", "BRB - BANCO DE BRASÍLIA S.A. - 070"
];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const sessaoValida = sessao.iniciar();
        const perfil = await exigirPerfil(user, ['escritorio'], sessaoValida);
        if (!perfil || !sessaoValida()) return;
        usuarioEscritorio = perfil;
        let logado = perfil.nome;
        document.getElementById('nome-usuario').innerText = 'Olá, ' + logado.split(' ')[0];
        
        carregarEstadosIniciais();
        preencherListaBancos();
        iniciarSincronizacaoEmTempoReal();
        sincronizarPesadores();
    } else {
        sessao.encerrar();
        window.location.href = '../index.html';
    }
});

async function carregarEstadosIniciais() {
    try {
        let res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        let estados = await res.json();
        let ufSelectPec = document.getElementById('novo_pec_uf');
        let ufSelectDest = document.getElementById('novo_dest_uf');
        
        estados.sort((a,b) => compararNomes(a.sigla,b.sigla)).forEach(e => {
            let option = `<option value="${e.sigla}">${e.nome}</option>`;
            ufSelectPec.innerHTML += option;
            ufSelectDest.innerHTML += option;
        });
    } catch(e) { console.log('Erro ao carregar IBGE'); }
}

function preencherListaBancos() {
    let dataList = document.getElementById('lista_bancos');
    bancosBrasileiros.sort(compararNomes).forEach(banco => {
        dataList.innerHTML += `<option value="${banco}">`;
    });
}

window.carregarCidades = async function(idUf, idDataList, idInputCidade) {
    let uf = document.getElementById(idUf).value;
    let inputCidade = document.getElementById(idInputCidade);
    let dataList = document.getElementById(idDataList);
    
    inputCidade.value = ''; inputCidade.placeholder = 'Carregando cidades...'; dataList.innerHTML = '';
    
    try {
        let res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
        let cidades = await res.json();
        inputCidade.placeholder = 'Digite e selecione a cidade...';
        cidades.sort((a,b) => compararNomes(a.nome,b.nome)).forEach(c => dataList.innerHTML += `<option value="${c.nome}">`);
    } catch(e) { inputCidade.placeholder = 'Erro ao carregar cidades'; }
}

window.validarSelecaoDaLista = function(inputElement, dataListId) {
    if (!inputElement.value) return; 
    let dataList = document.getElementById(dataListId);
    let options = dataList.options;
    let valorValido = false;
    for (let i = 0; i < options.length; i++) {
        if (inputElement.value === options[i].value) { valorValido = true; break; }
    }
    if (!valorValido) {
        alert("Atenção: Selecione uma opção válida da lista fornecida.");
        inputElement.value = ''; inputElement.focus();
    }
}

window.mostrarTela = function(telaId) {
    limparCredenciais();
    cancelarHistorico?.(); cancelarHistorico = null;
    document.getElementById('tela-historico-compra').style.display = 'none';
    document.getElementById('tela-romaneios').style.display = 'none';
    document.getElementById('tela-pecuaristas').style.display = 'none';
    document.getElementById('tela-destinos').style.display = 'none';
    document.getElementById('tela-usuarios').style.display = 'none';
    
    document.querySelectorAll('.aba-menu').forEach(b => { b.classList.remove('ativa'); b.removeAttribute('aria-current'); });

    document.getElementById(`tela-${telaId}`).style.display = 'block';
    document.getElementById(`btn-tab-${telaId}`).classList.add('ativa');
    document.getElementById(`btn-tab-${telaId}`).setAttribute('aria-current', 'page');
}

window.sair = async () => { limparCredenciais(); await sessao.sair(); };

function iniciarSincronizacaoEmTempoReal() {
    const qPec = query(collection(db, "pecuaristas"), orderBy("nome", "asc"));
    sessao.observar(qPec, (snapshot) => {
        pecuaristasGlobais = [];
        let tbody = document.getElementById('tbody-pecuaristas');
        tbody.innerHTML = '';
        
        if(snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="celula-vazia">Nenhum pecuarista no banco de dados.</td></tr>';
        } else {
            [...snapshot.docs].sort((a,b) => compararNomes(a.data().nome,b.data().nome)).forEach((doc) => {
                let p = doc.data();
                pecuaristasGlobais.push(p);
                let localF = (p.cidade && p.estado) ? `${p.cidade} - ${p.estado}` : '-';
                tbody.innerHTML += `<tr><td><strong>${escapeHtml(p.nome)}</strong></td><td class="col-doc">${escapeHtml(p.documento || '-')}</td><td class="col-local">${escapeHtml(localF)}</td><td>${escapeHtml(p.banco || '-')}</td><td class="col-doc">${escapeHtml(p.agencia || '-')}</td><td class="col-doc">${escapeHtml(p.conta || '-')}</td></tr>`;
            });
        }
        tbody.querySelectorAll('tr').forEach(tr => { tr.dataset.busca = tr.textContent; });
        aplicarBuscaTabela('tbody-pecuaristas', document.getElementById('busca-pecuaristas').value);
    });

    const qDest = query(collection(db, "destinos"), orderBy("nome", "asc"));
    sessao.observar(qDest, (snapshot) => {
        destinosGlobais = [];
        let tbody = document.getElementById('tbody-destinos');
        tbody.innerHTML = '';
        
        if(snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="2" class="celula-vazia">Nenhuma fazenda destino cadastrada.</td></tr>';
        } else {
            [...snapshot.docs].sort((a,b) => compararNomes(a.data().nome,b.data().nome)).forEach((doc) => {
                let d = doc.data();
                destinosGlobais.push(d);
                let localF = (d.cidade && d.estado) ? `${d.cidade} - ${d.estado}` : '-';
                tbody.innerHTML += `<tr><td><strong>${escapeHtml(d.nome)}</strong></td><td class="col-local">${escapeHtml(localF)}</td></tr>`;
            });
        }
        tbody.querySelectorAll('tr').forEach(tr => { tr.dataset.busca = tr.textContent; });
        aplicarBuscaTabela('tbody-destinos', document.getElementById('busca-destinos').value);
    });

    const qRom = query(collection(db, 'romaneios'));
    sessao.observar(qRom, snapshot => {
        const compras = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        numerarComprasAntigas(compras);
        romaneiosGlobais = compras
            .filter(r => !r.status || r.status === 'enviado_escritorio');
        atualizarOpcoesFiltros();
        renderizarCompras();
    });
}
// Atualiza somente o número público de registros antigos, sem mudar suas compras.
async function numerarComprasAntigas(compras) {
    for (const compra of compras) {
        if (temNumeroCompra(compra) || numeracoesEmAndamento.has(compra.id)) continue;
        if (!usuarioEscritorio || auth.currentUser?.uid !== usuarioEscritorio.uid) return;
        numeracoesEmAndamento.add(compra.id);
        try {
            const contador = doc(db, 'contadores', 'compras');
            await executarNumeracao(leitura => runTransaction(db, async transacao => {
                const ref = doc(db, 'romaneios', compra.id);
                const atual = await transacao.get(ref);
                if (!atual.exists() || temNumeroCompra(atual.data())) return;
                const numeroCompra = await reservarNumeroCompra(transacao, contador, atual.data(), compra.id, leitura);
                transacao.update(ref, { numeroCompra });
            }), async () => (await getDoc(contador)).data()?.valor || 0);
        } catch {
            document.getElementById('resultado-filtros').textContent = 'Não foi possível gerar os números das compras. Confira a conexão e a publicação das regras do banco.';
        } finally { numeracoesEmAndamento.delete(compra.id); }
    }
}

function atualizarOpcoesFiltros() {
    const listas = {
        fazenda: [...new Set(romaneiosGlobais.map(r => r.fazendaDestino).filter(Boolean))].map(nome => [nome, nome]),
        originador: [...new Map(romaneiosGlobais.filter(r => r.comprador).map(r => [r.compradorUid || r.comprador, r.comprador]))]
    };
    Object.entries(listas).forEach(([campo, opcoes]) => {
        const select = document.getElementById('filtro-' + campo), atual = select.value;
        select.replaceChildren(new Option(campo === 'fazenda' ? 'Todas' : 'Todos', ''));
        opcoes.sort((a,b) => a[1].localeCompare(b[1], 'pt-BR')).forEach(([valor, nome]) => select.add(new Option(nome, valor)));
        // Preserva a seleção mesmo se uma atualização retirar o último resultado da lista.
        if (atual && !opcoes.some(([valor]) => valor === atual)) select.add(new Option(atual, atual));
        select.value = atual;
    });
}
function renderizarCompras() {
    const filtros = Object.fromEntries(['codigo','texto','fazenda','originador','etapa','mes'].map(campo => [campo, document.getElementById('filtro-' + campo).value]));
    const visiveis = filtrarCompras(romaneiosGlobais, filtros);
    const tbody = document.getElementById('tbody-romaneios'); tbody.replaceChildren();
    document.getElementById('resultado-filtros').textContent = `${visiveis.length} de ${romaneiosGlobais.length} compras`;
    document.getElementById('chkAll').checked = false;
    if (!visiveis.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="celula-vazia">Nenhuma compra encontrada.</td></tr>'; return;
    }
    visiveis.sort((a, b) => (b.dataCompra || '').localeCompare(a.dataCompra || '')).forEach(r => {
        let dataF = r.dataCompra ? r.dataCompra.split('-').reverse().join('/') : '-';

        const anexosVisual = resumoDocumentos(r);

        let valorGado = r.valorTotalGado ? `<span class="valor-total">${escapeHtml(r.valorTotalGado)}</span>` : '-';
        let precoStr = r.precoUnitario ? `<span class="celula-dupla"><span>R$ ${escapeHtml(r.precoUnitario)}</span><span class="texto-suave">${escapeHtml(r.unidadePreco)}</span></span>` : '-';

        let comissaoStr = '-';
        if (r.tipoComissao && r.tipoComissao !== 'Nenhuma') {
            let totalVal = r.totalComissao ? r.totalComissao : `R$ ${r.valorComissao}`;
            comissaoStr = `<span class="celula-dupla"><strong>${escapeHtml(totalVal)}</strong><span class="texto-suave">${escapeHtml(r.tipoComissao)}</span></span>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="col-chk"><input type="checkbox" class="chk-export" value="${escapeHtml(r.id)}" aria-label="Selecionar registro"></td>
                <td class="col-data"><strong>${escapeHtml(dataF)}</strong></td>
                <td class="col-destaque"><span class="texto-cortado">${escapeHtml(r.pecuarista)}</span><span class="texto-cortado texto-suave codigo-compra">${escapeHtml(codigoDaCompra(r) || 'Gerando número...')}</span></td>
                <td>${escapeHtml((r.comprador || '').split(' ')[0])}</td>
                <td class="col-etapa-escritorio"></td>
                <td class="col-num"><strong>${escapeHtml(r.cabecas)}</strong></td>
                <td class="col-num">${escapeHtml(r.pesoTotal)}</td>
                <td class="col-num">${precoStr}</td>
                <td class="col-num">${valorGado}</td>
                <td class="col-num">${comissaoStr}</td>
                <td>${escapeHtml(r.raca || '-')}</td>
                <td>${escapeHtml(r.cidade)} - ${escapeHtml(r.estado)}</td>
                <td class="col-destino"><span class="texto-cortado">${escapeHtml(r.fazendaDestino || '-')}</span></td>
                <td class="col-anexos">${anexosVisual}</td>
            </tr>
        `;
    });
    tbody.querySelectorAll('tr').forEach((tr, indice) => {
        const compra = visiveis[indice];
        if (compra) montarControleEtapa(tr.querySelector('.col-etapa-escritorio'), compra);
    });
    // Nome completo no tooltip, preenchido pelo DOM para não interpolar valores do banco em atributos
    tbody.querySelectorAll('.texto-cortado').forEach(el => { el.title = el.textContent; });
    tbody.querySelectorAll('.tag-anexo').forEach(el => { el.title = el.querySelector('.tag-texto').textContent; });
}
function resumoDocumentos(compra) {
    const anexos = [...(compra.anexosLinks || []), ...(compra.anexos || []).filter(nome => !(compra.anexosLinks || []).some(a => a.nomeArquivo === nome)).map(nomeArquivo => ({ nomeArquivo }))];
    return `<details><summary>Documentos (${anexos.length})</summary>` + tiposDocumento.map(([tipo,nome]) => {
        const arquivos = anexos.filter(a => categoriaDocumento(a) === tipo);
        const links = arquivos.map(a => {
            let seguro = false; try { seguro = !a.somenteTexto && new URL(a.urlDownload).protocol === 'https:'; } catch {}
            const texto = `<span class="tag-texto">${escapeHtml(a.nomeArquivo)}${a.somenteTexto ? ' (somente nome)' : ''}</span>`;
            return seguro ? `<a class="tag tag-indigo tag-anexo tag-link" href="${escapeHtml(a.urlDownload)}" target="_blank" rel="noopener noreferrer">${texto}</a>` : `<span class="tag tag-anexo">${texto}</span>`;
        }).join('<br>');
        return `<div><strong>${nome}</strong><br>${links || '<span class="texto-suave">Não anexado (opcional)</span>'}</div>`;
    }).join('') + '</details>';
}
['codigo','texto','fazenda','originador','etapa','mes'].forEach(campo => {
    document.getElementById('filtro-' + campo).addEventListener(['codigo','texto'].includes(campo) ? 'input' : 'change', renderizarCompras);
});
document.getElementById('limpar-filtros').addEventListener('click', () => {
    ['codigo','texto','fazenda','originador','etapa','mes'].forEach(campo => { document.getElementById('filtro-' + campo).value = ''; });
    renderizarCompras();
});

window.adicionarPecuarista = async function() {
    let nomeInput = document.getElementById('novo_pec_nome');
    let nome = nomeInput.value.trim();
    if (!validarCadastro('novo_pec_')) return;
    
    let btn = document.getElementById('btn-salvar-pec');
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        await addDoc(collection(db, "pecuaristas"), {
            nome: nome.toUpperCase(),
            documento: document.getElementById('novo_pec_doc').value.trim(),
            estado: document.getElementById('novo_pec_uf').value,
            cidade: document.getElementById('novo_pec_cidade').value.trim(),
            banco: document.getElementById('novo_pec_banco').value.trim(),
            agencia: document.getElementById('novo_pec_agencia').value.trim(),
            conta: document.getElementById('novo_pec_conta').value.trim(),
            timestamp: serverTimestamp()
        });
        
        document.querySelectorAll('[id^="novo_pec_"]').forEach(i => i.value = '');
        document.getElementById('lista_cidades_pec').innerHTML = ''; 
        alert('Pecuarista cadastrado com sucesso!');
        
    } catch (error) {
        alert("Ocorreu um erro ao salvar: " + error.message);
    } finally {
        btn.innerText = "Salvar pecuarista";
        btn.disabled = false;
    }
}

window.adicionarDestino = async function() {
    let nomeInput = document.getElementById('novo_dest_nome');
    let nome = nomeInput.value.trim();
    let uf = document.getElementById('novo_dest_uf').value;
    let cidade = document.getElementById('novo_dest_cidade').value.trim();

    if (!validarCadastro('novo_dest_')) return;
    
    let btn = document.getElementById('btn-salvar-dest');
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        await addDoc(collection(db, "destinos"), {
            nome: nome.toUpperCase(),
            estado: uf,
            cidade: cidade,
            timestamp: serverTimestamp()
        });
        
        document.getElementById('novo_dest_nome').value = '';
        document.getElementById('novo_dest_uf').value = '';
        document.getElementById('novo_dest_cidade').value = '';
        document.getElementById('lista_cidades_dest').innerHTML = ''; 
        alert('Fazenda de destino cadastrada com sucesso!');
        
    } catch (error) {
        alert("Ocorreu um erro ao salvar: " + error.message);
    } finally {
        btn.innerText = "Salvar destino";
        btn.disabled = false;
    }
}

function baixarCSV(conteudoCSV, nomeArquivo) {
    let blob = new Blob(["\uFEFF" + conteudoCSV], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    let url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", nomeArquivo);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.exportarExcelGeral = function() {
    if(romaneiosGlobais.length === 0) return alert('Nenhum romaneio para exportar.');
    
    let selecionados = Array.from(document.querySelectorAll('.chk-export:checked')).map(cb => cb.value);
    if(selecionados.length === 0) return alert('Por favor, marque as caixinhas na primeira coluna da tabela para escolher quais compras exportar.');

    let romaneiosExport = romaneiosGlobais.filter(r => selecionados.includes(r.id));
    if (romaneiosExport.some(r => !temNumeroCompra(r))) return alert('Aguarde a geração dos números das compras antes de exportar. Se não concluir, confira as regras do banco.');

    let csv = "Ordem de Compra;ID Registro;Data Compra;Data Pagamento;Originador;Pecuarista;UF Origem;Cidade Origem;Fazenda Destino;Cidade Destino;UF Destino;Raça;Sexo;Cabeças;Peso Total (kg);Peso Médio (kg);Preço Unitário;Unidade Preço;Valor Total Gado;Corretor;Tipo Comissão;Base Comissão;Total Comissão;Etapa Escritório;Responsável Escritório;Finalizado Por;Observações\n";
    
    romaneiosExport.forEach(r => {
        let dataF = r.dataCompra ? r.dataCompra.split('-').reverse().join('/') : '-';
        let dataP = r.dataPagamento ? r.dataPagamento.split('-').reverse().join('/') : '-';
        let obs = r.observacoes ? r.observacoes.replace(/\n/g, " ") : "-";
        
        csv += `${codigoDaCompra(r)};${codigoDaCompra(r)};${dataF};${dataP};${r.comprador};${r.pecuarista};${r.estado};${r.cidade};${r.fazendaDestino || '-'};${r.cidadeDestino || '-'};${r.ufDestino || '-'};${r.raca || '-'};${r.sexo || '-'};${r.cabecas};${r.pesoTotal};${r.pesoMedio || pesoMedio(r.cabecas, r.pesoTotal) || '-'};${r.precoUnitario || '-'};${r.unidadePreco || '-'};${r.valorTotalGado || '-'};${r.corretor || '-'};${r.tipoComissao || '-'};${r.valorComissao || '-'};${r.totalComissao || '-'};${etapasEscritorio[etapaAtual(r)]?.nome || '-'};${r.responsavelEscritorio || '-'};${r.finalizadoPor || '-'};${obs}\n`;
    });
    baixarCSV(csv, "GVQ_Relatorio_Compras.csv");
}

window.exportarExcelPesos = function() {
    if(romaneiosGlobais.length === 0) return alert('Nenhum romaneio para exportar.');
    
    let selecionados = Array.from(document.querySelectorAll('.chk-export:checked')).map(cb => cb.value);
    if(selecionados.length === 0) return alert('Por favor, marque as caixinhas na primeira coluna da tabela para escolher de quais compras deseja exportar os pesos.');

    let romaneiosExport = romaneiosGlobais.filter(r => selecionados.includes(r.id));
    if (romaneiosExport.some(r => !temNumeroCompra(r))) return alert('Aguarde a geração dos números das compras antes de exportar. Se não concluir, confira as regras do banco.');

    let csv = "Ordem de Compra;ID Romaneio;Data Compra;Pecuarista;Originador;Número do Animal;Peso (kg)\n";
    let temPesos = false;
    romaneiosExport.forEach(r => {
        let dataF = r.dataCompra ? r.dataCompra.split('-').reverse().join('/') : '-';
        if(r.pesosIndividuais && r.pesosIndividuais.length > 0) {
            temPesos = true;
            r.pesosIndividuais.forEach((peso, index) => {
                csv += `${codigoDaCompra(r)};${codigoDaCompra(r)};${dataF};${r.pecuarista};${r.comprador};Animal ${index + 1};${peso}\n`;
            });
        }
    });
    if(!temPesos) return alert('Nenhum peso individual registrado nas compras selecionadas.');
    baixarCSV(csv, "GVQ_Relatorio_Pesos.csv");
}


function validarCadastro(prefixo) {
    for (const campo of document.querySelectorAll(`input[id^="${prefixo}"], select[id^="${prefixo}"]`)) {
        campo.value = campo.value.trim();
        if (!campo.reportValidity()) return false;
    }
    return true;
}
function sincronizarPesadores() {
    sessao.observar(collection(db,'usuarios'), snapshot => atualizarUsuarios(snapshot.docs.map(d => ({...d.data(),uid:d.id}))), error => alert('Não foi possível carregar usuários: ' + error.message));
}

function montarControleEtapa(td, compra) {
    if (!td) return;
    const anterior = etapaAtual(compra);
    const select = document.createElement('select');
    select.className = etapasEscritorio[anterior]?.classe || 'tag';
    select.style.border = '0';
    select.setAttribute('aria-label', 'Etapa da compra de ' + compra.pecuarista);
    Object.entries(etapasEscritorio).forEach(([valor, etapa]) => {
        const option = new Option(etapa.nome, valor);
        option.disabled = valor !== anterior && !podeMudarEtapa(anterior, valor);
        select.add(option);
    });
    select.value = anterior;
    select.onchange = () => alterarEtapa(compra, select.value, select);
    const historico = document.createElement('button'); historico.type = 'button';
    historico.className = 'btn btn-fantasma btn-sm'; historico.textContent = 'Histórico';
    historico.onclick = () => abrirHistoricoCompra(compra);
    td.append(select, document.createTextNode(' '), historico);
    const detalhe = document.createElement('div'); detalhe.className = 'texto-suave';
    detalhe.textContent = anterior === 'finalizada'
        ? (compra.finalizadoPor ? 'Concluída por ' + compra.finalizadoPor : '')
        : anterior === 'em_andamento' ? (compra.responsavelEscritorio || '')
        : Number(compra.revisaoValidada || 1) > 1 ? 'Nova revisão de documentos' : '';
    if (detalhe.textContent) td.appendChild(detalhe);
}
async function alterarEtapa(compra, proxima, select) {
    const anterior = etapaAtual(compra);
    if (anterior === proxima) return;
    select.disabled = true;
    try {
        if (!podeMudarEtapa(anterior, proxima)) throw new Error('Transição de etapa inválida.');
        const referencia = doc(db, 'romaneios', compra.id);
        const evento = doc(collection(db, 'romaneios', compra.id, 'historicoEscritorio'));
        await runTransaction(db, async transacao => {
            const snap = await transacao.get(referencia);
            if (!snap.exists()) throw new Error('Compra não encontrada.');
            const atual = snap.data();
            if (atual.status && atual.status !== 'enviado_escritorio') throw new Error('A compra está aguardando revalidação do originador.');
            if (etapaAtual(atual) !== anterior || (atual.revisaoValidada || 1) !== (compra.revisaoValidada || 1)) throw new Error('A compra foi atualizada. Confira a etapa atual e tente novamente.');
            const alteracoes = { etapaEscritorio: proxima, etapaAtualizadaEm: serverTimestamp(),
                etapaAtualizadaPorUid: usuarioEscritorio.uid, ultimoEventoEscritorio: evento.id };
            if (proxima === 'em_andamento') Object.assign(alteracoes, { responsavelEscritorioUid: usuarioEscritorio.uid,
                responsavelEscritorio: usuarioEscritorio.nome, finalizadoPorUid: null, finalizadoPor: null, finalizadoEm: null });
            else Object.assign(alteracoes, { finalizadoPorUid: usuarioEscritorio.uid, finalizadoPor: usuarioEscritorio.nome, finalizadoEm: serverTimestamp() });
            transacao.update(referencia, alteracoes);
            transacao.set(evento, { tipo: 'etapa_escritorio', etapa: proxima, etapaAnterior: anterior,
                usuarioUid: usuarioEscritorio.uid, usuario: usuarioEscritorio.nome, revisao: atual.revisaoValidada || 1, quando: serverTimestamp() });
        });
    } catch (error) { select.value = anterior; alert('Não foi possível alterar a etapa: ' + error.message); }
    finally { select.disabled = false; }
}
function formatarQuando(valor) {
    const data = valor?.toDate?.() || (valor?.seconds ? new Date(valor.seconds * 1000) : null);
    return data ? data.toLocaleString('pt-BR') : '—';
}
function abrirHistoricoCompra(compra) {
    window.mostrarTela('romaneios');
    document.getElementById('tela-romaneios').style.display = 'none';
    document.getElementById('tela-historico-compra').style.display = 'block';
    document.getElementById('historico-compra-pecuarista').textContent = compra.pecuarista + ' — ' + codigoDaCompra(compra);
    const tbody = document.getElementById('tbody-historico-compra');
    tbody.innerHTML = '<tr><td colspan="4" class="celula-vazia">Carregando histórico...</td></tr>';
    cancelarHistorico = sessao.observar(query(collection(db, 'romaneios', compra.id, 'historicoEscritorio'), orderBy('quando', 'desc')), snapshot => {
        tbody.replaceChildren();
        if (snapshot.empty) { tbody.innerHTML = '<tr><td colspan="4" class="celula-vazia">Nenhuma alteração registrada.</td></tr>'; return; }
        snapshot.forEach(evento => {
            const e = evento.data(), tr = document.createElement('tr');
            const nome = etapasEscritorio[e.etapa]?.nome || e.etapa;
            const alteracao = e.tipo === 'validacao_originador'
                ? (Number(e.revisao) > 1 ? 'Recebida após revalidação' : 'Recebida do originador')
                : `${etapasEscritorio[e.etapaAnterior]?.nome || '—'} → ${nome}`;
            [formatarQuando(e.quando), alteracao, e.usuario, String(e.revisao || 1)].forEach(valor => {
                const td = document.createElement('td'); td.textContent = valor || '—'; tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    });
}

['pecuaristas','destinos'].forEach(tipo => document.getElementById('busca-' + tipo).addEventListener('input',event => aplicarBuscaTabela('tbody-' + tipo,event.target.value)));


