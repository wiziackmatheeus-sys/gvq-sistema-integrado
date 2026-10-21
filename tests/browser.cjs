const {chromium} = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const baseline = process.env.GVQ_BASE_REF;
const original = baseline ? require('child_process').execFileSync('git', ['show', baseline+':pages/painel.html'], {cwd:root, encoding:'utf8'}) : null;
const firebaseMock = `
const h=()=>window.__mock;
const listeners=h().listeners||(h().listeners=[]);
export const auth={get currentUser(){return h().uid?{uid:h().uid}:null},signOut:async()=>{h().signedOut=true;}};
export const app={}, db={}, storage={};
export function getFunctions(){return {}}
export function httpsCallable(f,nome){return async dados=>{h().chamadas??=[];h().chamadas.push({nome,dados});localStorage.setItem('teste_funcao',nome);if(h().failFunction)throw Object.assign(new Error('Serviço indisponível'),{code:'functions/unavailable'});return {data:{uid:'criado',login:dados.login||'paulo.pesador',senhaTemporaria:'Temporaria-teste-123',sucesso:true}}}}
export function onAuthStateChanged(a,callback){queueMicrotask(()=>callback({uid:h().uid}));return ()=>{}}
export async function signOut(){
 if(h().failSignOut){const antigos=[...listeners];setTimeout(()=>antigos.forEach(l=>l.error?.(new Error('Missing or insufficient permissions.'))),10);throw new Error('Falha simulada de saída')}
 localStorage.setItem('teste_listeners_no_logout',String(listeners.filter(l=>l.ativo).length));
 h().signedOut=true;h().uid=null;
 // Simula erros que já estavam enfileirados quando os listeners foram cancelados.
 for(const l of listeners)queueMicrotask(()=>l.error?.(new Error('Missing or insufficient permissions.')));
}
export function collection(db,...partes){return {name:partes.join('/')}}
export function doc(a,...partes){if(a.name)return {name:a.name,id:a.name==='pesagens'?'new-id':'evento-'+(h().autoId=(h().autoId||Object.values(h().data).reduce((n,c)=>Math.max(n,...Object.keys(c).map(k=>Number(k.replace('evento-',''))||0)),0))+1)};const id=partes.pop();return {name:partes.join('/'),id}}
export function where(field,op,value){return {field,op,value}}
export function orderBy(){return {}}
export function query(col,...filters){return {...col,filters}}
export function serverTimestamp(){return 'SERVER_TIME'}
function snap(name,id){const data=h().data[name]?.[id];return {id,exists:()=>!!data,data:()=>structuredClone(data)}}
function emit(ref,callback){const docs=Object.entries(h().data[ref.name]||{}).filter(([id,d])=>(ref.filters||[]).every(f=>!f.field||(f.op==='in'?f.value.includes(d[f.field]):(f.field==='__name__'?id:d[f.field])===f.value))).map(([id])=>snap(ref.name,id));callback({docs,empty:!docs.length,forEach:f=>docs.forEach(f)})}
function notify(){for(const {ref,callback,ativo} of listeners)if(ativo)emit(ref,callback)}
export async function getDocsFromServer(ref){if(h().hangRead)return new Promise(()=>{});return getDocs(ref)}
export async function getDocs(ref){let result;emit(ref,s=>result=s);return result}
export async function getDoc(ref){h().reads.push(ref);return snap(ref.name,ref.id)}
export function onSnapshot(ref,callback,error){h().reads.push(ref);const l={ref,callback,error,ativo:true};listeners.push(l);emit(ref,callback);return ()=>{l.ativo=false}}
export async function setDoc(ref,data){if(h().hangWrite)await new Promise(resolve=>h().releaseWrite=resolve);h().writes.push({name:ref.name,id:ref.id,data});h().data[ref.name]??={};h().data[ref.name][ref.id]=structuredClone(data);notify()}
export async function addDoc(ref,data){return setDoc({...ref,id:'new-id'},data)}
export async function runTransaction(db,callback){
 const staged=[];
 await callback({get:async ref=>snap(ref.name,ref.id),set:(ref,data)=>staged.push({ref,data,kind:'set'}),update:(ref,data)=>staged.push({ref,data,kind:'update'})});
 for(const w of staged){h().data[w.ref.name]??={};h().data[w.ref.name][w.ref.id]=w.kind==='update'?{...h().data[w.ref.name][w.ref.id],...structuredClone(w.data)}:structuredClone(w.data);h().writes.push({name:w.ref.name,id:w.ref.id,data:w.data})}notify();
}
export async function signInWithEmailAndPassword(){return {user:{uid:h().uid}}}
export async function createUserWithEmailAndPassword(){return {user:{uid:h().uid}}}
export function ref(storage,path){return {path}}
export async function uploadBytes(ref,file){if(h().failUpload)throw new Error('Storage indisponível');h().uploads.push({path:ref.path,name:file.name,size:file.size})}
export function setMaxUploadRetryTime(){}
export function setMaxOperationRetryTime(){}
export function uploadBytesResumable(ref,file){
 const tarefa={snapshot:{bytesTransferred:0,totalBytes:file.size},cancel(){h().cancelledUploads=(h().cancelledUploads||0)+1;return true},on(event,progress,error,complete){
  let active=true;queueMicrotask(async()=>{if(!active)return;progress(tarefa.snapshot);if(h().hangUpload)return;
   try{await uploadBytes(ref,file);if(!active)return;tarefa.snapshot.bytesTransferred=file.size;progress(tarefa.snapshot);complete()}
   catch(e){if(active)error(e)}});return ()=>{active=false};
 }};return tarefa;
}
export async function getDownloadURL(ref){return 'https://files.example.test/'+ref.path}
export async function deleteObject(ref){h().deleted.push(ref.path)}
`;
const pending = {estado:'SP',cidade:'Barretos',fazendaDestino:'Fazenda GVQ',cidadeDestino:'Ibitinga',ufDestino:'SP',pecuarista:'João Pecuarista',pecuaristaDocumento:'123',pecuaristaBanco:'Banco',pecuaristaAgencia:'1',pecuaristaConta:'2',dataCompra:'2026-10-19',dataPagamento:'2026-10-23',cabecas:'2',pesoTotal:'650.50',pesoMedio:'325.25',tipoPesagem:'individual',sexo:'Macho',raca:'F1 Angus',pesosIndividuais:[300,350.5],observacoes:'Conferir lote',anexos:[],anexosLinks:[],anexosCaminhos:[],compradorUid:'buyer1',comprador:'Ana Originadora',pesadorUid:'weigher1',pesador:'Paulo Pesador',revisao:1,status:'aguardando_comprador',timestamp:'BASE_TIME'};
function seed(uid,data){return {uid,reads:[],writes:[],uploads:[],deleted:[],data:data||{usuarios:{buyer1:{nome:'Ana Originadora',perfil:'originador',aprovado:true},buyer2:{nome:'Bruno Originador',perfil:'comprador',aprovado:true},weigher1:{nome:'Paulo Pesador',perfil:'pesador',aprovado:true,compradorUid:'buyer1',comprador:'Ana Originadora'},waiting:{nome:'Pedro Pesador',perfil:'pesador',aprovado:false},office1:{nome:'Olivia Escritório',perfil:'escritorio',aprovado:true},pendingOffice:{nome:'Escritório pendente',perfil:'escritorio',aprovado:false}},pesagens:{p1:pending,p2:{...pending,compradorUid:'buyer2',pesadorUid:'weigher2'}},romaneios:{old:{comprador:'Ana Originadora',pecuarista:'Legado',cabecas:'1',dataCompra:'2026-09-01'}},pecuaristas:{pec1:{nome:'João Pecuarista',cidade:'Barretos',estado:'SP',documento:'123',banco:'Banco',agencia:'1',conta:'2'}},destinos:{dest1:{nome:'Fazenda GVQ',cidade:'Ibitinga',estado:'SP'}}}}}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.GVQ_CHROMIUM_PATH?{executablePath:process.env.GVQ_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 async function pageFor(uid,file,width=1280,data,context){
  const contexto=context||await browser.newContext({viewport:{width,height:900}});
  const page=await contexto.newPage(), errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.accept()});
  await page.addInitScript(mock=>{window.__mock=mock},seed(uid,data));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='www.gstatic.com')return route.fulfill({contentType:'application/javascript',body:firebaseMock});
   if(u.hostname==='servicodados.ibge.gov.br')return route.fulfill({contentType:'application/json',body:JSON.stringify(u.pathname.includes('municipios')?[{nome:'Barretos'}]:[{sigla:'SP',nome:'São Paulo'}])});
   if(u.hostname!=='gvq.local')return route.abort();
   if(u.pathname==='/js/firebase.js')return route.fulfill({contentType:'application/javascript',body:"export {app,auth,db,storage} from 'https://www.gstatic.com/mock.js';"});
   if(original&&u.pathname==='/original.html')return route.fulfill({contentType:'text/html',body:original.replaceAll('../','/').replace(/<script[^>]+src="\/js\/painel.js"><\/script>/,'')});
   const f=path.join(root,u.pathname);if(!fs.existsSync(f))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});
  });
  await page.goto('https://gvq.local/'+file);await page.waitForTimeout(100);return {page,errors,alerts};
 }
 async function fillOperacional(p,individual=false){
  await p.locator('#rom_uf').selectOption('SP');await p.locator('#rom_cidade').fill('Barretos');await p.locator('#lista_cidades_ui .autocomplete-item').click();
  await p.locator('#rom_fazenda_destino').fill('Fazenda');await p.locator('#lista_destinos_ui .autocomplete-item').click();
  await p.locator('#rom_busca_pec').fill('João');await p.locator('#lista_pecuaristas_ui .autocomplete-item').click();
  await p.locator('#rom_data_compra').fill('2026-10-19');await p.locator('#rom_data_pag').fill('2026-10-23');
  await p.locator('#rom_sexo').selectOption('Macho');await p.locator('#rom_raca').selectOption('F1 Angus');
  if(individual){await p.evaluate(()=>window.mostrarTelaPesagem());await p.locator('#peso_ind_1').fill('300');await p.locator('#peso_ind_2').fill('350.5');await p.evaluate(()=>window.salvarPesosGrid())}
  else{await p.locator('#rom_cabecas').fill('2');await p.locator('#rom_peso_total').fill('650.5')}
 }
 // A página pública permite apenas entrar; contas anteriores pendentes continuam bloqueadas.
 const {page:signup,errors:se}=await pageFor('new-user','index.html');
 assert.equal(await signup.getByText('Para obter acesso, solicite seu cadastro ao escritório.',{exact:true}).count(),0);assert.equal(await signup.locator('#form-cadastro').count(),0);assert.equal(await signup.getByRole('button',{name:'Nova conta',exact:true}).count(),0);assert.deepEqual(se,[]);
 const {page:waiting}=await pageFor('waiting','pages/pesador.html');await waiting.waitForURL('**/index.html');
 console.log('PASS: cadastro público removido; contas pendentes anteriores permanecem bloqueadas.');
 // Escritório aprova e vincula, com compatibilidade para contas antigas de comprador.
 const {page:office,errors:oe}=await pageFor('office1','pages/escritorio.html');
 await office.locator('#btn-tab-usuarios').click();const row=office.locator('#tbody-usuarios tr').filter({hasText:'Pedro Pesador'});
 await row.locator('select').selectOption('buyer2');await row.getByRole('button',{name:'Aprovar e vincular'}).click();
 assert.equal(await office.evaluate(()=>window.__mock.data.usuarios.waiting.compradorUid),'buyer2');
 assert.equal(await office.evaluate(()=>window.__mock.data.usuarios.waiting.aprovadoPor),'office1');assert.deepEqual(oe,[]);
 console.log('PASS: escritório designa originador e aprova pesador.');
 // Criação e redefinição usam o serviço administrativo sem trocar a sessão.
 await office.locator('#conta-nome').fill('Carlos da Fazenda');await office.locator('#conta-nome').blur();
 assert.equal(await office.locator('#conta-login').inputValue(),'carlos.fazenda');
 await office.locator('#conta-perfil').selectOption('originador');assert.equal(await office.locator('#grupo-conta-originador').isVisible(),false);await office.locator('#conta-perfil').selectOption('pesador');
 await office.locator('#conta-originador').selectOption('buyer1');await office.locator('#btn-criar-conta').click();
 assert.equal(await office.locator('#senha-temporaria').inputValue(),'Temporaria-teste-123');
 assert.equal(await office.evaluate(()=>window.__mock.uid),'office1');
 assert.deepEqual(await office.evaluate(()=>window.__mock.chamadas[0].dados),{nome:'Carlos da Fazenda',login:'carlos.fazenda',perfil:'pesador',compradorUid:'buyer1'});
 await office.locator('#ocultar-credenciais').click();assert.equal(await office.locator('#senha-temporaria').inputValue(),'');
 await office.locator('#tbody-usuarios tr').filter({hasText:'Paulo Pesador'}).getByRole('button',{name:'Redefinir senha',exact:true}).click();
 assert.equal(await office.evaluate(()=>window.__mock.chamadas.at(-1).nome),'redefinirSenha');assert.equal(await office.evaluate(()=>window.__mock.chamadas.at(-1).dados.uid),'weigher1');
 await office.locator('#filtro-perfil-usuarios').selectOption('originador');assert.equal(await office.locator('#tbody-usuarios tr').count(),2);
 await office.locator('#busca-usuarios').fill('bruno');assert.equal(await office.locator('#tbody-usuarios tr').count(),1);
 await office.locator('#btn-tab-romaneios').click();assert.equal(await office.locator('#senha-temporaria').inputValue(),'');
 const {page:accountsFail,alerts:accountAlerts}=await pageFor('office1','pages/escritorio.html');await accountsFail.locator('#btn-tab-usuarios').click();await accountsFail.evaluate(()=>window.__mock.failFunction=true);
 await accountsFail.locator('#tbody-usuarios tr').filter({hasText:'Paulo Pesador'}).getByRole('button',{name:'Redefinir senha',exact:true}).click();
 assert.ok(accountAlerts.some(a=>a.includes('publicação das funções')));assert.equal(await accountsFail.locator('#resultado-conta').isVisible(),false);await accountsFail.close();
 // Escritório está disponível somente na criação interna e dispensa vínculo ao originador.
 await office.locator('#btn-tab-usuarios').click();await office.locator('#conta-perfil').selectOption('escritorio');
 assert.equal(await office.locator('#grupo-conta-originador').isVisible(),false);
 await office.locator('#conta-nome').fill('Novo Escritório');await office.locator('#conta-login').fill('novo.escritorio');await office.locator('#btn-criar-conta').click();
 assert.equal(await office.evaluate(()=>window.__mock.chamadas.at(-1).dados.perfil),'escritorio');
 await office.locator('#filtro-perfil-usuarios').selectOption('escritorio');await office.locator('#busca-usuarios').fill('');
 assert.ok((await office.locator('#tbody-usuarios').innerText()).includes('Olivia Escritório'));
 assert.equal(await office.locator('#tbody-usuarios tr').filter({hasText:'Olivia Escritório'}).getByRole('button',{name:'Redefinir senha',exact:true}).count(),0);
 console.log('PASS: criação/redefinição, filtros de usuários e senha oculta ao sair.');
 const forced=seed('weigher1').data;forced.usuarios.weigher1.trocaSenhaObrigatoria=true;
 const {page:forceRedirect}=await pageFor('weigher1','pages/pesador.html',1280,forced);await forceRedirect.waitForURL('**/trocar-senha.html');
 assert.equal(await forceRedirect.evaluate(()=>window.__mock.reads.some(r=>r.name==='pesagens')),false);
 await forceRedirect.screenshot({path:path.join(root,'test-results','trocar-senha-1280.png'),fullPage:true});
 await forceRedirect.locator('#senha-atual').fill('Temporaria-123');await forceRedirect.locator('#nova-senha').fill('Definitiva-456');await forceRedirect.locator('#confirmar-senha').fill('Diferente-456');
 await forceRedirect.locator('#btn-trocar-senha').click();assert.ok((await forceRedirect.locator('#erro-senha').innerText()).includes('iguais'));
 await forceRedirect.locator('#confirmar-senha').fill('Definitiva-456');await forceRedirect.locator('#btn-trocar-senha').click();await forceRedirect.waitForURL('**/index.html');
 assert.equal(await forceRedirect.evaluate(()=>localStorage.getItem('teste_funcao')),'trocarSenhaInicial');await forceRedirect.close();
 const {page:forcedLogin}=await pageFor('weigher1','index.html',1280,forced);await forcedLogin.locator('#login_usuario').fill('paulo.pesador');await forcedLogin.locator('#login_senha').fill('Temporaria-123');await forcedLogin.locator('#btn-entrar').click();await forcedLogin.waitForURL('**/trocar-senha.html');await forcedLogin.close();
 console.log('PASS: troca obrigatória no login e URL direta, confirmação e saída após trocar.');

 // Rascunho incompleto, grade não confirmada e conteúdo dos anexos sobrevivem à recarga.
 const {page:draft,errors:draftErrors}=await pageFor('weigher1','pages/pesador.html');
 await draft.locator('#rom_obs').fill('Compra incompleta — preservar');
 await draft.locator('#rom_uf').selectOption('SP');
 await draft.locator('#rom_cidade').fill('Barretos');await draft.locator('#lista_cidades_ui .autocomplete-item').click();
 await draft.locator('#rom_raca').selectOption('outro');await draft.locator('#rom_raca_outra').fill('Raça de teste');
 await draft.locator('#input_arquivos_romaneio_manual').setInputFiles({name:'rascunho.pdf',mimeType:'application/pdf',buffer:Buffer.from('PDF preservado')});
 await draft.evaluate(()=>window.mostrarTelaPesagem());await draft.locator('#peso_ind_1').fill('303.25');
 await draft.waitForFunction(()=>document.getElementById('situacao-rascunho').textContent.startsWith('Rascunho salvo'));
 assert.equal(await draft.evaluate(()=>window.__mock.writes.length),0);
 await draft.reload();await draft.waitForFunction(()=>document.getElementById('situacao-rascunho').textContent.includes('recuperado'));
 assert.equal(await draft.locator('#rom_obs').inputValue(),'Compra incompleta — preservar');
 assert.equal(await draft.locator('#rom_cidade').inputValue(),'Barretos');
 assert.equal(await draft.locator('#rom_raca_outra').inputValue(),'Raça de teste');
 assert.ok((await draft.locator('#lista-arquivos-ui').innerText()).includes('rascunho.pdf'));
 await draft.evaluate(()=>window.mostrarTelaPesagem());assert.equal(await draft.locator('#peso_ind_1').inputValue(),'303.25');
 // O UID vem da sessão; outro pesador no mesmo navegador não recupera o rascunho.
 const otherData=seed('weigher2').data;otherData.usuarios.weigher2={...otherData.usuarios.weigher1,nome:'Outro Pesador'};
 const {page:other}=await pageFor('weigher2','pages/pesador.html',1280,otherData,draft.context());
 assert.equal(await other.locator('#rom_obs').inputValue(),'');await other.close();
 // Duas abas da mesma conta não podem sobrescrever silenciosamente a mesma revisão.
 const {page:secondDraft}=await pageFor('weigher1','pages/pesador.html',1280,undefined,draft.context());
 await draft.evaluate(()=>window.voltarTelaPrincipal());await draft.locator('#rom_obs').fill('Versão mais recente');
 await draft.waitForFunction(()=>document.getElementById('situacao-rascunho').textContent.startsWith('Rascunho salvo'));
 await secondDraft.locator('#rom_obs').fill('Versão antiga');
 await secondDraft.waitForFunction(()=>document.getElementById('situacao-rascunho').textContent.includes('outra aba'));
 await secondDraft.close();
 await draft.reload();await draft.waitForFunction(()=>document.getElementById('situacao-rascunho').textContent.includes('recuperado'));
 assert.equal(await draft.locator('#rom_obs').inputValue(),'Versão mais recente');
 // Arquivo recuperado é enviado com o conteúdo original; falha de upload mantém o rascunho.
 await fillOperacional(draft);await draft.evaluate(()=>window.__mock.failUpload=true);
 await draft.locator('#btn-registrar').click();
 await draft.waitForFunction(()=>!document.getElementById('btn-registrar').disabled);
 await draft.reload();await draft.waitForFunction(()=>document.getElementById('situacao-rascunho').textContent.includes('recuperado'));
 assert.equal(await draft.locator('#rom_obs').inputValue(),'Versão mais recente');
 await draft.locator('#btn-registrar').click();await draft.waitForFunction(()=>window.__mock.writes.length===1);
 await draft.waitForFunction(()=>document.getElementById('rom_obs').value==='');
 assert.equal(await draft.evaluate(()=>window.__mock.uploads[0].size),Buffer.byteLength('PDF preservado'));
 await draft.reload();await draft.waitForFunction(()=>!document.getElementById('form-romaneio').inert);
 assert.equal(await draft.locator('#rom_obs').inputValue(),'');assert.equal(await draft.locator('#lista-arquivos-ui .item-anexo').count(),0);
 await draft.locator('#rom_obs').fill('Descartar');await draft.locator('#btn-salvar-rascunho').click();
 await draft.locator('#btn-descartar-rascunho').click();await draft.waitForFunction(()=>document.getElementById('rom_obs').value==='');
 await draft.reload();await draft.waitForFunction(()=>!document.getElementById('form-romaneio').inert);
 assert.equal(await draft.locator('#rom_obs').inputValue(),'');assert.deepEqual(draftErrors,[]);await draft.close();
 console.log('PASS: rascunho automático recupera campos, pesos e arquivos; isola contas, detecta conflitos e limpa após envio ou descarte.');
 const {page:w,errors:we}=await pageFor('weigher1','pages/pesador.html');
 assert.equal(await w.locator('#rom_originador').inputValue(),'Ana Originadora');assert.equal(await w.locator('#rom_comprador').count(),0);
 assert.equal(await w.evaluate(()=>window.__mock.reads.some(r=>r.name==='usuarios'&&!r.id)),false);
 assert.equal(await w.locator('#rom_raca option[value="F1 Angus"],#rom_raca option[value="Europeu"]').count(),2);assert.deepEqual(await w.locator('#rom_raca option').allTextContents(),['Selecione...','Brangus','Cruzado','Europeu','F1 Angus','Nelore','Outra']);
 await fillOperacional(w);
 assert.equal(await w.locator('#rom_peso_medio').inputValue(),'325.25');
 assert.equal(await w.locator('#rom_cabecas').getAttribute('readonly'),null);
 await w.locator('#btn-registrar').click();await w.waitForTimeout(50);
 let writes=await w.evaluate(()=>window.__mock.writes);assert.equal(writes.length,1);assert.equal(writes[0].data.tipoPesagem,'balancao');assert.deepEqual(writes[0].data.pesosIndividuais,[]);
 assert.equal(writes[0].data.compradorUid,'buyer1');assert.ok(!('precoUnitario' in writes[0].data));assert.equal(await w.locator('#rom_peso_medio').inputValue(),'');assert.deepEqual(we,[]);
 console.log('PASS: pesagem por balanção sem individuais e sem valores; vínculo não selecionável.');
 // Upload inicial e pesos individuais também funcionam.
 const {page:wi,errors:wie}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(wi,true);
 await wi.locator('#input_arquivos_romaneio_manual').setInputFiles({name:'romaneio.pdf',mimeType:'application/pdf',buffer:Buffer.from('PDF teste')});await wi.locator('#btn-registrar').click();await wi.waitForTimeout(30);
 assert.equal(await wi.evaluate(()=>window.__mock.uploads.length),1);assert.equal(await wi.evaluate(()=>window.__mock.writes[0].data.anexosLinks[0].categoria),'romaneio_manual');assert.equal(await wi.evaluate(()=>window.__mock.writes[0].data.anexosLinks[0].nomeArquivo),'romaneio.pdf');assert.deepEqual(wie,[]);
 console.log('PASS: pesos individuais e arquivo inicial com link persistido.');
 // Documentos de tipos diferentes e arquivos com o mesmo nome conservam suas categorias.
 const {page:docs,errors:de}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(docs);
 for(const [tipo,mimeType] of [['nota_fiscal','application/pdf'],['ordem_embarque_checklist','application/pdf'],['foto_gado','image/jpeg'],['video_gado','video/mp4']]){
  await docs.locator('#input_arquivos_'+tipo).setInputFiles({name:'mesmo-nome',mimeType,buffer:Buffer.from('arquivo teste')});
 }
 assert.equal(await docs.locator('#lista-arquivos-ui .item-anexo').count(),4);
 await docs.locator('#btn-registrar').click();await docs.waitForTimeout(40);
 assert.deepEqual(await docs.evaluate(()=>window.__mock.writes[0].data.anexosLinks.map(a=>a.categoria)),['nota_fiscal','ordem_embarque_checklist','foto_gado','video_gado']);
 assert.deepEqual(de,[]);await docs.close();
 console.log('PASS: nota fiscal, foto e vídeo opcionais conservam categorias e nomes repetidos.');

 // Storage que não responde é cancelado, libera o botão e conserva os dados.
 const {page:stalled,alerts:stallAlerts}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(stalled);
 await stalled.locator('#input_arquivos_ordem_embarque_checklist').setInputFiles({name:'checklist.pdf',mimeType:'application/pdf',buffer:Buffer.from('checklist')});
 await stalled.clock.install();await stalled.evaluate(()=>window.__mock.hangUpload=true);await stalled.locator('#btn-registrar').click();
 await stalled.waitForFunction(()=>document.getElementById('btn-registrar').textContent.includes('Enviando anexo'));
 await stalled.clock.fastForward(45001);await stalled.waitForFunction(()=>!document.getElementById('btn-registrar').disabled);
 assert.equal(await stalled.evaluate(()=>window.__mock.writes.length),0);assert.equal(await stalled.evaluate(()=>window.__mock.cancelledUploads),1);
 assert.equal(await stalled.locator('#rom_cabecas').inputValue(),'2');assert.ok(stallAlerts.some(a=>a.includes('não respondeu a tempo')));await stalled.close();
 // Gravação sem confirmação pode terminar depois: não apagar seus anexos nem duplicar a compra.
 const {page:uncertain,alerts:uncertainAlerts}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(uncertain);
 await uncertain.locator('#input_arquivos_ordem_embarque_checklist').setInputFiles({name:'checklist.pdf',mimeType:'application/pdf',buffer:Buffer.from('checklist')});
 await uncertain.clock.install();await uncertain.evaluate(()=>window.__mock.hangWrite=true);await uncertain.locator('#btn-registrar').click();
 await uncertain.waitForFunction(()=>document.getElementById('btn-registrar').textContent.includes('Confirmando compra no banco'));
 await uncertain.clock.fastForward(45001);await uncertain.waitForFunction(()=>!document.getElementById('btn-registrar').disabled);
 assert.ok(uncertainAlerts.some(a=>a.includes('Não foi possível confirmar')));assert.equal(await uncertain.evaluate(()=>window.__mock.deleted.length),0);
 assert.equal(await uncertain.locator('#rom_cabecas').inputValue(),'2');
 await uncertain.evaluate(()=>{window.__mock.hangWrite=false;window.__mock.releaseWrite()});await uncertain.waitForFunction(()=>window.__mock.writes.length===1);
 await uncertain.locator('#btn-registrar').click();await uncertain.waitForFunction(()=>!document.getElementById('btn-registrar').disabled);
 assert.equal(await uncertain.evaluate(()=>window.__mock.writes.length),1);assert.equal(await uncertain.locator('#rom_cabecas').inputValue(),'');await uncertain.close();
 console.log('PASS: upload travado é cancelado e gravação tardia preserva anexos sem duplicar a compra.');
 // Originador revisa um novo registro gerado pela tela do pesador.
 let data=await w.evaluate(()=>window.__mock.data);data.pesagens={p1:{...data.pesagens[writes[0].id]}};
 const {page:b,errors:be}=await pageFor('buyer1','pages/painel.html',1280,data);
 await b.getByRole('button',{name:'Conferir',exact:true}).click();
 assert.equal(await b.locator('#rom_raca').inputValue(),'F1 Angus');assert.equal(await b.locator('#rom_peso_medio').inputValue(),'325.25');
 assert.equal(await b.locator('#rom_preco').evaluate(el=>el.checkValidity()),false);
 await b.locator('#rom_preco').fill('12');await b.locator('#rom_corretor').fill('Sem corretor');
 assert.equal(await b.locator('#rom_valor_total').inputValue(),'R$\u00a07.806,00');
 assert.equal(await b.locator('#rom_total_comissao').inputValue(),'R$\u00a00,00');
 await b.locator('#rom_unidade_preco').selectOption('Por Arroba');await b.locator('#rom_preco').fill('300');
 // A mesma pesagem pode chegar do Firestore com as chaves em outra ordem.
 await b.evaluate(()=>{const p=window.__mock.data.pesagens.p1;window.__mock.data.pesagens.p1=Object.fromEntries(Object.entries(p).reverse())});
 await b.locator('#btn-registrar').click();await b.waitForTimeout(50);
 assert.equal(await b.evaluate(()=>window.__mock.data.romaneios.p1?.valorTotalGado),'R$\u00a06.505,00', 'Balanção sem alterações deve validar mesmo com campos em outra ordem');
 assert.equal(await b.evaluate(()=>window.__mock.data.romaneios.p1.revisaoValidada),1);assert.deepEqual(be,[]);
 const codigoCompra=await b.evaluate(()=>window.__mock.data.romaneios.p1.codigoCompra);
 assert.equal(codigoCompra,'OC-GVQ-202610-p1');
 console.log('PASS: originador preenche os campos obrigatórios e valida o registro.');
 const exportData=await b.evaluate(()=>window.__mock.data);
 exportData.romaneios.p1.pesosIndividuais=[300,350.5];
 const {page:exportPage,errors:exportErrors}=await pageFor('office1','pages/escritorio.html',1280,exportData);
 const exportRow=exportPage.locator('#tbody-romaneios tr').filter({hasText:'João Pecuarista'});
 assert.equal(await exportRow.locator('.codigo-compra').innerText(),codigoCompra);
 assert.equal(await exportRow.locator('.codigo-compra').getAttribute('title'),codigoCompra);
 await exportRow.locator('.chk-export').check();
 for(const [metodo,arquivo] of [['exportarExcelGeral','GVQ_Relatorio_Compras.csv'],['exportarExcelPesos','GVQ_Relatorio_Pesos.csv']]){
  const downloadPromise=exportPage.waitForEvent('download');
  await exportPage.evaluate(m=>window[m](),metodo);
  const download=await downloadPromise, csv=fs.readFileSync(await download.path(),'utf8').replace(/^\uFEFF/,'');
  assert.equal(download.suggestedFilename(),arquivo);
  assert.ok(csv.startsWith('Ordem de Compra;ID '));
  assert.ok(csv.split('\n')[1].startsWith(codigoCompra+';p1;'));
 }
 assert.deepEqual(exportErrors,[]);
 // Filtros combinados, seleção restrita à lista e consulta ao histórico da compra correta.
 await exportPage.locator('#filtro-texto').fill('joao');
 await exportPage.locator('#filtro-codigo').fill(codigoCompra);
 await exportPage.locator('#filtro-fazenda').selectOption('Fazenda GVQ');
 await exportPage.locator('#filtro-originador').selectOption('buyer1');
 await exportPage.locator('#filtro-etapa').selectOption('recebida');
 await exportPage.locator('#filtro-mes').fill('2026-10');await exportPage.locator('#filtro-mes').dispatchEvent('change');
 assert.equal(await exportPage.locator('#tbody-romaneios .chk-export').count(),1);
 await exportPage.locator('#chkAll').check();assert.equal(await exportPage.locator('.chk-export:checked').count(),1);
 await exportRow.locator('.col-etapa-escritorio select').selectOption('em_andamento');await exportPage.waitForTimeout(30);
 assert.equal(await exportPage.evaluate(()=>window.__mock.data.romaneios.p1.etapaEscritorio),'em_andamento');
 assert.equal(await exportPage.locator('#filtro-etapa').inputValue(),'recebida');
 await exportPage.locator('#filtro-etapa').selectOption('finalizada');
 assert.equal(await exportPage.locator('#tbody-romaneios .chk-export').count(),0);
 assert.ok((await exportPage.locator('#tbody-romaneios').innerText()).includes('Nenhuma compra encontrada'));
 await exportPage.locator('#limpar-filtros').click();
 assert.equal(await exportPage.locator('#tbody-romaneios .chk-export').count(),2);
 assert.equal(await exportPage.locator('.chk-export:checked').count(),0);
 await exportRow.locator('.col-anexos summary').click();
 assert.ok((await exportRow.locator('.col-anexos').innerText()).includes('Nota fiscal'));
 assert.ok((await exportRow.locator('.col-anexos').innerText()).includes('Não anexado (opcional)'));
 await exportPage.close();
 console.log('PASS: filtros combinados, nenhum resultado, seleção visível e documentos opcionais no escritório.');
 console.log('PASS: código automático visível no escritório e idêntico nas exportações de compras e pesos.');
 const {page:catalog}=await pageFor('office1','pages/escritorio.html');await catalog.locator('#btn-tab-pecuaristas').click();
 await catalog.locator('#busca-pecuaristas').fill('joao barretos');assert.equal(await catalog.locator('#tbody-pecuaristas tr[data-busca]:visible').count(),1);
 await catalog.locator('#busca-pecuaristas').fill('inexistente');assert.ok((await catalog.locator('#tbody-pecuaristas').innerText()).includes('Nenhum resultado'));
 await catalog.locator('#busca-pecuaristas').fill('');await catalog.locator('#btn-tab-destinos').click();await catalog.locator('#busca-destinos').fill('ibitinga');assert.equal(await catalog.locator('#tbody-destinos tr[data-busca]:visible').count(),1);await catalog.close();
 const {page:queue}=await pageFor('buyer1','pages/painel.html');await queue.locator('#pendente-busca').fill('inexistente');assert.equal(await queue.locator('#tbody-pendentes button').count(),0);await queue.locator('#pendente-busca').fill('joao');assert.equal(await queue.locator('#tbody-pendentes button').count(),1);await queue.locator('#pendente-tipo').selectOption('revalidacao');assert.equal(await queue.locator('#tbody-pendentes button').count(),0);await queue.getByRole('button',{name:'Limpar filtros',exact:true}).click();assert.equal(await queue.locator('#tbody-pendentes button').count(),1);await queue.close();
 const {page:hist}=await pageFor('weigher1','pages/pesador.html');await hist.evaluate(()=>window.mostrarTelaHistorico());await hist.locator('#filtro_busca').fill('joao');assert.equal(await hist.locator('#tbody-historico .col-documentos').count(),1);await hist.locator('#filtro_situacao').selectOption('enviado_escritorio');assert.equal(await hist.locator('#tbody-historico .col-documentos').count(),0);await hist.evaluate(()=>window.limparFiltrosHistorico());assert.equal(await hist.locator('#tbody-historico .col-documentos').count(),1);await hist.close();
 console.log('PASS: busca sem acentos em cadastros, pendências por tipo e histórico por situação.');

 // Documento posterior retira a compra do escritório e preserva negociação anterior para revalidação.
 data=await b.evaluate(()=>window.__mock.data);
 // O escritório assume e finaliza antes de o pesador complementar documentos.
 const {page:processing,errors:pe}=await pageFor('office1','pages/escritorio.html',1280,data);
 const compra=processing.locator('#tbody-romaneios tr').filter({hasText:'João Pecuarista'});
 assert.equal(await compra.locator('.col-etapa-escritorio select').inputValue(),'recebida');
 await compra.locator('.col-etapa-escritorio select').selectOption('em_andamento');await processing.waitForTimeout(30);
 assert.equal(await processing.evaluate(()=>window.__mock.data.romaneios.p1.responsavelEscritorio),'Olivia Escritório');
 await compra.locator('.col-etapa-escritorio select').selectOption('finalizada');await processing.waitForTimeout(30);
 assert.equal(await processing.evaluate(()=>window.__mock.data.romaneios.p1.finalizadoPorUid),'office1');
 await processing.screenshot({path:path.join(root,'test-results/escritorio-etapas.png'),fullPage:true});
 await compra.getByRole('button',{name:'Histórico',exact:true}).click();
 await processing.screenshot({path:path.join(root,'test-results/escritorio-historico.png'),fullPage:true});
 assert.ok((await processing.locator('#tbody-historico-compra').innerText()).includes('Em andamento → Finalizada'));
 assert.ok((await processing.locator('#tbody-historico-compra').innerText()).includes('Recebida do originador'));
 assert.deepEqual(pe,[]);
 data=await processing.evaluate(()=>window.__mock.data);
 const {page:wc,errors:wce}=await pageFor('weigher1','pages/pesador.html',1280,data);
 await wc.evaluate(()=>window.mostrarTelaHistorico());await wc.getByRole('button',{name:'Anexar documentos'}).click();
 await wc.locator('#input_complementos_gta').setInputFiles({name:'GTA.pdf',mimeType:'application/pdf',buffer:Buffer.from('GTA teste')});
 await wc.locator('#btn-complementar').click();await wc.waitForTimeout(40);
 assert.equal(await wc.evaluate(()=>window.__mock.data.pesagens.p1.anexosLinks[0].categoria),'gta');
 assert.equal(await wc.evaluate(()=>window.__mock.data.pesagens.p1.revisao),2);assert.equal(await wc.evaluate(()=>window.__mock.data.romaneios.p1.status),'aguardando_revalidacao');
 assert.equal(await wc.evaluate(()=>window.__mock.reads.some(r=>r.name==='romaneios')),false);assert.deepEqual(wce,[]);
 data=await wc.evaluate(()=>window.__mock.data);
 const {page:oc}=await pageFor('office1','pages/escritorio.html',1280,data);
 assert.equal(await oc.locator('#tbody-romaneios input.chk-export').count(),1); // Só legado; p1 ainda em revalidação.
 assert.ok(!(await oc.locator('#tbody-romaneios').innerText()).includes('João Pecuarista'));
 const {page:br,errors:bre}=await pageFor('buyer1','pages/painel.html',1280,data);assert.ok((await br.locator('#tbody-pendentes').innerText()).includes('Novos documentos'));await br.getByRole('button',{name:'Revalidar',exact:true}).click();
 assert.equal(await br.locator('#rom_preco').inputValue(),'300');assert.equal(await br.locator('#rom_tipo_pesagem').inputValue(),'balancao');
 assert.equal(await br.locator('#lista-arquivos-ui a').count(),1);assert.ok((await br.locator('#lista-arquivos-ui').innerText()).includes('GTA: GTA.pdf'));assert.equal(await br.locator('#campos-documentos [data-situacao=gta]').innerText(),'1 arquivo(s)');
 await br.locator('#rom_data_compra').fill('2026-11-01');
 await br.locator('#btn-registrar').click();await br.waitForTimeout(40);
 assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.codigoCompra),codigoCompra,'Correção do mês e revalidação preservam a ordem original');
 assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.revisaoValidada),2);assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.anexosLinks.length),1);assert.deepEqual(bre,[]);
 console.log('PASS: complementação com upload simulado, bloqueio no escritório e revalidação sem perder negociação.');
 assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.etapaEscritorio),'recebida');
 assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.finalizadoPorUid),null);
 data=await br.evaluate(()=>window.__mock.data);
 const {page:returned}=await pageFor('office1','pages/escritorio.html',1280,data);
 const nova=returned.locator('#tbody-romaneios tr').filter({hasText:'João Pecuarista'});
 assert.equal(await nova.locator('.col-etapa-escritorio select').inputValue(),'recebida');
 assert.ok((await nova.innerText()).includes('Nova revisão de documentos'));
 await nova.getByRole('button',{name:'Histórico',exact:true}).click();
 const registros=returned.locator('#tbody-historico-compra');
 assert.equal(await registros.locator('tr').count(),4);
 assert.ok((await registros.innerText()).includes('Recebida após revalidação'));
 assert.ok((await registros.innerText()).includes('Em andamento → Finalizada'));
 console.log('PASS: compra finalizada recebe anexos, retorna Recebida após revalidação e preserva todo o histórico.');

 // Timestamp técnico e ordem dos campos podem variar entre leitura normal e transação.
 const {page:timestampPage,alerts:ta}=await pageFor('buyer1','pages/painel.html',1280,JSON.parse(JSON.stringify({ ...seed('buyer1').data,
     pesagens:{p1:{...pending,tipoPesagem:'balancao',pesosIndividuais:[],timestamp:null}}
 })));
 await timestampPage.getByRole('button',{name:'Conferir',exact:true}).click();
 await timestampPage.locator('#rom_preco').fill('12');await timestampPage.locator('#rom_corretor').fill('Sem corretor');
 await timestampPage.evaluate(()=>window.__mock.data.pesagens.p1.timestamp={seconds:1792425600,nanoseconds:0});
 await timestampPage.locator('#btn-registrar').click();await timestampPage.waitForTimeout(30);
 assert.equal(await timestampPage.evaluate(()=>window.__mock.data.romaneios.p1.status),'enviado_escritorio');
 assert.ok(!ta.some(a=>a.includes('atualizado')));
 // Alteração real de peso ou revisão de documentos durante a conferência continua bloqueada.
 for (const mudanca of [{pesoTotal:'700'}, {revisao:2}]) {
  const {page:stale,alerts:sa}=await pageFor('buyer1','pages/painel.html');
  await stale.getByRole('button',{name:'Conferir',exact:true}).click();
  await stale.locator('#rom_preco').fill('12');await stale.locator('#rom_corretor').fill('Sem corretor');
  await stale.evaluate(m=>Object.assign(window.__mock.data.pesagens.p1,m),mudanca);
  await stale.locator('#btn-registrar').click();await stale.waitForTimeout(30);
  assert.equal(await stale.evaluate(()=>window.__mock.writes.length),0);
  assert.ok(sa.some(a=>a.includes('O registro foi atualizado')));
  await stale.close();
 }
 console.log('PASS: balanção inalterado valida com chaves/timestamps diferentes; mudanças reais continuam bloqueadas.');
 const {page:reopen}=await pageFor('office1','pages/escritorio.html',1280,await processing.evaluate(()=>window.__mock.data));
 const finalizada=reopen.locator('#tbody-romaneios tr').filter({hasText:'João Pecuarista'});
 await finalizada.locator('.col-etapa-escritorio select').selectOption('em_andamento');await reopen.waitForTimeout(30);
 assert.equal(await reopen.evaluate(()=>window.__mock.data.romaneios.p1.etapaEscritorio),'em_andamento');
 assert.equal(await reopen.evaluate(()=>window.__mock.data.romaneios.p1.finalizadoEm),null);
 console.log('PASS: escritório reabre compra finalizada sem apagar o histórico.');
 // Falha de upload não cria registro nem declara sucesso.
 const {page:fail,alerts:fa}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(fail);await fail.evaluate(()=>window.__mock.failUpload=true);
 await fail.locator('#input_arquivos').setInputFiles({name:'GTA.pdf',mimeType:'application/pdf',buffer:Buffer.from('teste')});await fail.locator('#btn-registrar').click();await fail.waitForTimeout(20);
 assert.equal(await fail.evaluate(()=>window.__mock.writes.length),0);assert.ok(fa.some(a=>a.includes('Não foi possível enviar')));
 console.log('PASS: falha de upload preserva formulário e impede falso sucesso.');
 // URLs de outro perfil e contas não aprovadas são redirecionadas.
 for(const [uid,file,target] of [['weigher1','pages/painel.html','pesador.html'],['weigher1','pages/escritorio.html','pesador.html'],['buyer2','pages/pesador.html','painel.html'],['pendingOffice','pages/escritorio.html','index.html']]){const {page}=await pageFor(uid,file);await page.waitForURL('**/'+target);await page.close()}
 console.log('PASS: perfis antigos e novos respeitam os redirecionamentos.');
 // Sair cancela consultas antes da autenticação desaparecer, nos três perfis.
 for (const [uid,file] of [['weigher1','pages/pesador.html'],['buyer1','pages/painel.html'],['office1','pages/escritorio.html']]) {
  const {page:logout,alerts:la,errors:le}=await pageFor(uid,file);
  assert.ok(await logout.evaluate(()=>window.__mock.listeners.filter(l=>l.ativo).length)>0);
  await logout.evaluate(()=>{localStorage.setItem('gvq_sistema_logado','Usuário');localStorage.setItem('gvq_sistema_perfil','perfil');localStorage.setItem('outro_app_dado','preservar')});
  await logout.getByRole('button',{name:'Sair',exact:true}).click();await logout.waitForURL('**/index.html');
  assert.equal(await logout.evaluate(()=>localStorage.getItem('teste_listeners_no_logout')),'0');
  assert.equal(await logout.evaluate(()=>localStorage.getItem('gvq_sistema_logado')),null);
  assert.equal(await logout.evaluate(()=>localStorage.getItem('gvq_sistema_perfil')),null);
  assert.equal(await logout.evaluate(()=>localStorage.getItem('outro_app_dado')),'preservar');
  assert.deepEqual(la,[],uid+': logout não deve mostrar erros de permissão');assert.deepEqual(le,[]);
  await logout.close();
 }
 console.log('PASS: logout dos três perfis cancela listeners, ignora callbacks tardios e mantém dados de outros apps.');
 // Falhas reais continuam sendo avisadas enquanto a sessão está ativa.
 const {page:permission,alerts:pa}=await pageFor('buyer1','pages/painel.html');
 await permission.evaluate(()=>window.__mock.listeners.find(l=>l.ativo).error(new Error('Missing or insufficient permissions.')));
 assert.ok(pa.some(a=>a.includes('Missing or insufficient permissions')));
 await permission.close();
 // Se o logout falhar, a sessão e suas consultas continuam funcionando.
 const {page:logoutFail,alerts:lfa}=await pageFor('buyer1','pages/painel.html');
 const antes=await logoutFail.evaluate(()=>window.__mock.listeners.filter(l=>l.ativo).length);
 await logoutFail.evaluate(()=>window.__mock.failSignOut=true);
 await logoutFail.getByRole('button',{name:'Sair',exact:true}).click();await logoutFail.waitForTimeout(30);
 assert.ok(logoutFail.url().endsWith('/pages/painel.html'));
 assert.equal(await logoutFail.evaluate(()=>window.__mock.listeners.filter(l=>l.ativo).length),antes);
 assert.ok(lfa.some(a=>a.includes('Não foi possível sair da conta')));
 assert.equal(lfa.filter(a=>a.includes('Missing or insufficient permissions')).length,0);
 await logoutFail.evaluate(()=>window.__mock.failSignOut=false);
 await logoutFail.getByRole('button',{name:'Sair',exact:true}).click();await logoutFail.waitForURL('**/index.html');
 assert.equal(await logoutFail.evaluate(()=>localStorage.getItem('teste_listeners_no_logout')),'0');
 console.log('PASS: erros reais de acesso permanecem visíveis; falha de logout restaura as consultas e permite tentar novamente.');
 // Obrigatoriedade: anexos e observações são opcionais; raça extra só quando Outra.
 const {page:required}=await pageFor('weigher1','pages/pesador.html');
 assert.deepEqual(await required.locator('#form-romaneio input:not([type=file]):not(#rom_raca_outra),#form-romaneio select').evaluateAll(els=>els.filter(e=>!e.required).map(e=>e.id)),[]);
 assert.equal(await required.locator('#campos-documentos input[type=file]').count(),8);
 assert.equal(await required.locator('#campos-documentos input[type=file]').evaluateAll(els=>els.some(e=>e.required)),false);
 assert.equal(await required.locator('#input_arquivos').evaluate(e=>e.required),false);assert.equal(await required.locator('#rom_obs').evaluate(e=>e.required),false);
 for(const width of [1280,375]){
  const {page:after}=await pageFor('buyer1','pages/painel.html',width);await after.getByRole('button',{name:'Conferir',exact:true}).click();
  if(original){
   const {page:before}=await pageFor('buyer1','original.html',width);
   await before.locator('#tela-pendentes').evaluate(el=>el.style.display='none');await before.locator('#tela-principal').evaluate(el=>el.style.display='block');
   await before.locator('#rom_uf').evaluate(el=>{el.add(new Option('SP','SP'));el.value='SP'});
   const props=['fontFamily','fontSize','fontWeight','color','backgroundColor','padding','borderRadius','gap','width'];
   for(const selector of ['.sidebar','.conteudo-inner','#form-romaneio .card','#rom_uf','#rom_preco','#rom_valor_total','#btn-registrar']){
    const style=p=>p.locator(selector).first().evaluate((el,props)=>Object.fromEntries(props.map(k=>[k,getComputedStyle(el)[k]])),props);
    assert.deepEqual(await style(after),await style(before),width+': '+selector);
   }
   await before.close();
  }
  await after.screenshot({path:path.join(root,'test-results','originador-'+width+'.png'),fullPage:true});
  const {page:pesador}=await pageFor('weigher1','pages/pesador.html',width);await pesador.screenshot({path:path.join(root,'test-results','pesador-'+width+'.png'),fullPage:true});
  const {page:officePreview}=await pageFor('office1','pages/escritorio.html',width);await officePreview.screenshot({path:path.join(root,'test-results','escritorio-filtros-'+width+'.png'),fullPage:true});await officePreview.locator('#btn-tab-usuarios').click();await officePreview.waitForTimeout(350);await officePreview.screenshot({path:path.join(root,'test-results','escritorio-'+width+'.png'),fullPage:true});
  console.log('PASS: estilos e telas em '+width+'px.');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});


