import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { exigirPerfil } from "./auth-guard.js";
import { escapeHtml } from "./fluxo-compra.js";

let pecuaristasGlobais = [];
let destinosGlobais = [];
let romaneiosGlobais = [];

const bancosBrasileiros = [
    "BANCO DO BRASIL S.A. - 001", "CAIXA ECONOMICA FEDERAL - 104", "BANCO BRADESCO S.A. - 237",
    "ITAÚ UNIBANCO S.A. - 341", "BANCO SANTANDER (BRASIL) S.A. - 033", "BANCO SICOOB S.A. - 756",
    "BANCO SICREDI S.A. - 748", "NUBANK - 260", "BANCO INTER S.A. - 077", "C6 BANK - 336",
    "BANCO BTG PACTUAL S.A. - 208", "BANCO SAFRA S.A. - 422", "BANCO ORIGINAL S.A. - 212",
    "BANCO PAN S.A. - 623", "BANCO MERCANTIL DO BRASIL S.A. - 389", "BANCO NORDESTE DO BRASIL S.A. - 004",
    "BANCO DA AMAZONIA S.A. - 003", "BRB - BANCO DE BRASILIA S.A. - 070"
];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const perfil = await exigirPerfil(user, ['escritorio']);
        if (!perfil) return;
        let logado = perfil.nome;
        document.getElementById('nome-usuario').innerText = 'Olá, ' + logado.split(' ')[0];
        
        carregarEstadosIniciais();
        preencherListaBancos();
        iniciarSincronizacaoEmTempoReal();
    } else {
        window.location.href = '../index.html';
    }
});

async function carregarEstadosIniciais() {
    try {
        let res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        let estados = await res.json();
        let ufSelectPec = document.getElementById('novo_pec_uf');
        let ufSelectDest = document.getElementById('novo_dest_uf');
        
        estados.forEach(e => {
            let option = `<option value="${e.sigla}">${e.nome}</option>`;
            ufSelectPec.innerHTML += option;
            ufSelectDest.innerHTML += option;
        });
    } catch(e) { console.log('Erro ao carregar IBGE'); }
}

function preencherListaBancos() {
    let dataList = document.getElementById('lista_bancos');
    bancosBrasileiros.forEach(banco => {
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
        cidades.forEach(c => dataList.innerHTML += `<option value="${c.nome}">`);
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
    document.getElementById('tela-romaneios').style.display = 'none';
    document.getElementById('tela-pecuaristas').style.display = 'none';
    document.getElementById('tela-destinos').style.display = 'none';
    
    document.querySelectorAll('.aba-menu').forEach(b => { b.classList.remove('ativa'); b.removeAttribute('aria-current'); });

    document.getElementById(`tela-${telaId}`).style.display = 'block';
    document.getElementById(`btn-tab-${telaId}`).classList.add('ativa');
    document.getElementById(`btn-tab-${telaId}`).setAttribute('aria-current', 'page');
}

window.sair = function() {
    signOut(auth).then(() => { localStorage.clear(); window.location.href = '../index.html'; });
}

function iniciarSincronizacaoEmTempoReal() {
    const qPec = query(collection(db, "pecuaristas"), orderBy("nome", "asc"));
    onSnapshot(qPec, (snapshot) => {
        pecuaristasGlobais = [];
        let tbody = document.getElementById('tbody-pecuaristas');
        tbody.innerHTML = '';
        
        if(snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="celula-vazia">Nenhum pecuarista no banco de dados.</td></tr>';
        } else {
            snapshot.forEach((doc) => {
                let p = doc.data();
                pecuaristasGlobais.push(p);
                let localF = (p.cidade && p.estado) ? `${p.cidade} - ${p.estado}` : '-';
                tbody.innerHTML += `<tr><td><strong>${escapeHtml(p.nome)}</strong></td><td class="col-doc">${escapeHtml(p.documento || '-')}</td><td class="col-local">${escapeHtml(localF)}</td><td>${escapeHtml(p.banco || '-')}</td><td class="col-doc">${escapeHtml(p.agencia || '-')}</td><td class="col-doc">${escapeHtml(p.conta || '-')}</td></tr>`;
            });
        }
    });

    const qDest = query(collection(db, "destinos"), orderBy("nome", "asc"));
    onSnapshot(qDest, (snapshot) => {
        destinosGlobais = [];
        let tbody = document.getElementById('tbody-destinos');
        tbody.innerHTML = '';
        
        if(snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="2" class="celula-vazia">Nenhuma fazenda destino cadastrada.</td></tr>';
        } else {
            snapshot.forEach((doc) => {
                let d = doc.data();
                destinosGlobais.push(d);
                let localF = (d.cidade && d.estado) ? `${d.cidade} - ${d.estado}` : '-';
                tbody.innerHTML += `<tr><td><strong>${escapeHtml(d.nome)}</strong></td><td class="col-local">${escapeHtml(localF)}</td></tr>`;
            });
        }
    });

    const qRom = query(collection(db, "romaneios")); 
    onSnapshot(qRom, (snapshot) => {
        romaneiosGlobais = [];
        let tbody = document.getElementById('tbody-romaneios');
        tbody.innerHTML = '';

        if(snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="13" class="celula-vazia">Nenhum romaneio registrado ainda.</td></tr>';
        } else {
            snapshot.forEach((docSnap) => {
                let r = docSnap.data();
                if (r.status && r.status !== 'enviado_escritorio') return;
                r.id = docSnap.id; 
                romaneiosGlobais.push(r);
            });

            romaneiosGlobais.sort((a, b) => (b.dataCompra || '').localeCompare(a.dataCompra || '')).forEach(r => {
                let dataF = r.dataCompra ? r.dataCompra.split('-').reverse().join('/') : '-';
                
                let anexosVisual = '-';
                if (r.anexosLinks && r.anexosLinks.length > 0) {
                    anexosVisual = r.anexosLinks.filter(a => { try { return new URL(a.urlDownload).protocol === 'https:'; } catch { return false; } }).map(a => `<a href="${escapeHtml(a.urlDownload)}" target="_blank" rel="noopener noreferrer" class="tag tag-indigo tag-anexo tag-link"><svg class="icon icon-sm"><use href="../assets/img/icones.svg#anexo"></use></svg><span class="tag-texto">${escapeHtml(a.nomeArquivo)}</span></a>`).join('<br>');
                } else if (r.anexos && r.anexos.length > 0) {
                    anexosVisual = r.anexos.map(n => `<span class="tag tag-anexo"><svg class="icon icon-sm"><use href="../assets/img/icones.svg#anexo"></use></svg><span class="tag-texto">${escapeHtml(n)}</span></span>`).join('<br>');
                }

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
                        <td class="col-destaque"><span class="texto-cortado">${escapeHtml(r.pecuarista)}</span></td>
                        <td>${escapeHtml((r.comprador || '').split(' ')[0])}</td>
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
            // Nome completo no tooltip, preenchido pelo DOM para não interpolar valores do banco em atributos
            tbody.querySelectorAll('.texto-cortado').forEach(el => { el.title = el.textContent; });
            tbody.querySelectorAll('.tag-anexo').forEach(el => { el.title = el.querySelector('.tag-texto').textContent; });
        }
    });
}

window.adicionarPecuarista = async function() {
    let nomeInput = document.getElementById('novo_pec_nome');
    let nome = nomeInput.value.trim();
    if(!nome) return alert('Digite o nome do pecuarista.');
    
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
        
        document.querySelectorAll('.form-grid-4 input, .form-grid-4 select, .form-grid-3 input').forEach(i => i.value = '');
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

    if(!nome || !uf || !cidade) return alert('Preencha o Nome, Estado e Cidade do destino.');
    
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
        alert('Fazenda Destino cadastrada com sucesso!');
        
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

    let csv = "ID Registro;Data Compra;Data Pagamento;Comprador;Pecuarista;UF Origem;Cidade Origem;Fazenda Destino;Cidade Destino;UF Destino;Raça;Sexo;Cabeças;Peso Total (kg);Preço Unitário;Unidade Preço;Valor Total Gado;Corretor;Tipo Comissão;Base Comissão;Total Comissão;Observações\n";
    
    romaneiosExport.forEach(r => {
        let dataF = r.dataCompra ? r.dataCompra.split('-').reverse().join('/') : '-';
        let dataP = r.dataPagamento ? r.dataPagamento.split('-').reverse().join('/') : '-';
        let obs = r.observacoes ? r.observacoes.replace(/\n/g, " ") : "-";
        
        csv += `${r.id};${dataF};${dataP};${r.comprador};${r.pecuarista};${r.estado};${r.cidade};${r.fazendaDestino || '-'};${r.cidadeDestino || '-'};${r.ufDestino || '-'};${r.raca || '-'};${r.sexo || '-'};${r.cabecas};${r.pesoTotal};${r.precoUnitario || '-'};${r.unidadePreco || '-'};${r.valorTotalGado || '-'};${r.corretor || '-'};${r.tipoComissao || '-'};${r.valorComissao || '-'};${r.totalComissao || '-'};${obs}\n`;
    });
    baixarCSV(csv, "GVQ_Relatorio_Compras.csv");
}

window.exportarExcelPesos = function() {
    if(romaneiosGlobais.length === 0) return alert('Nenhum romaneio para exportar.');
    
    let selecionados = Array.from(document.querySelectorAll('.chk-export:checked')).map(cb => cb.value);
    if(selecionados.length === 0) return alert('Por favor, marque as caixinhas na primeira coluna da tabela para escolher de quais compras deseja exportar os pesos.');

    let romaneiosExport = romaneiosGlobais.filter(r => selecionados.includes(r.id));

    let csv = "ID Romaneio;Data Compra;Pecuarista;Comprador;Número do Animal;Peso (kg)\n";
    let temPesos = false;
    romaneiosExport.forEach(r => {
        let dataF = r.dataCompra ? r.dataCompra.split('-').reverse().join('/') : '-';
        if(r.pesosIndividuais && r.pesosIndividuais.length > 0) {
            temPesos = true;
            r.pesosIndividuais.forEach((peso, index) => {
                csv += `${r.id};${dataF};${r.pecuarista};${r.comprador};Animal ${index + 1};${peso}\n`;
            });
        }
    });
    if(!temPesos) return alert('Nenhum peso individual registrado nas compras selecionadas.');
    baixarCSV(csv, "GVQ_Relatorio_Pesos.csv");
}

