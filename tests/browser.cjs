const {chromium} = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const baseline = process.env.GVQ_BASE_REF;
const original = baseline ? require('child_process').execFileSync('git', ['show', baseline+':pages/painel.html'], {cwd:root, encoding:'utf8'}) : null;
const firebaseMock = `
const h=()=>window.__mock;
const listeners=[];
export const auth={get currentUser(){return {uid:h().uid}},signOut:async()=>{h().signedOut=true;}};
export const db={}, storage={};
export function onAuthStateChanged(a,callback){queueMicrotask(()=>callback({uid:h().uid}));return ()=>{}}
export async function signOut(){h().signedOut=true;}
export function collection(db,name){return {name}}
export function doc(a,name,id){return a.name ? {name:a.name,id:'new-id'} : {name,id}}
export function where(field,op,value){return {field,op,value}}
export function orderBy(){return {}}
export function query(col,...filters){return {...col,filters}}
export function serverTimestamp(){return 'SERVER_TIME'}
function snap(name,id){const data=h().data[name]?.[id];return {id,exists:()=>!!data,data:()=>structuredClone(data)}}
function emit(ref,callback){const docs=Object.entries(h().data[ref.name]||{}).filter(([id,d])=>(ref.filters||[]).every(f=>!f.field||(f.op==='in'?f.value.includes(d[f.field]):d[f.field]===f.value))).map(([id])=>snap(ref.name,id));callback({docs,empty:!docs.length,forEach:f=>docs.forEach(f)})}
function notify(){for(const {ref,callback} of listeners)emit(ref,callback)}
export async function getDoc(ref){h().reads.push(ref);return snap(ref.name,ref.id)}
export function onSnapshot(ref,callback,error){h().reads.push(ref);listeners.push({ref,callback});emit(ref,callback);return ()=>{}}
export async function setDoc(ref,data){h().writes.push({name:ref.name,id:ref.id,data});h().data[ref.name]??={};h().data[ref.name][ref.id]=structuredClone(data);notify()}
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
export async function getDownloadURL(ref){return 'https://files.example.test/'+ref.path}
export async function deleteObject(ref){h().deleted.push(ref.path)}
`;
const pending = {estado:'SP',cidade:'Barretos',fazendaDestino:'Fazenda GVQ',cidadeDestino:'Ibitinga',ufDestino:'SP',pecuarista:'João Pecuarista',pecuaristaDocumento:'123',pecuaristaBanco:'Banco',pecuaristaAgencia:'1',pecuaristaConta:'2',dataCompra:'2026-10-19',dataPagamento:'2026-10-23',cabecas:'2',pesoTotal:'650.50',pesoMedio:'325.25',tipoPesagem:'individual',sexo:'Macho',raca:'F1 Angus',pesosIndividuais:[300,350.5],observacoes:'Conferir lote',anexos:[],anexosLinks:[],anexosCaminhos:[],compradorUid:'buyer1',comprador:'Ana Originadora',pesadorUid:'weigher1',pesador:'Paulo Pesador',revisao:1,status:'aguardando_comprador',timestamp:'BASE_TIME'};
function seed(uid,data){return {uid,reads:[],writes:[],uploads:[],deleted:[],data:data||{usuarios:{buyer1:{nome:'Ana Originadora',perfil:'originador',aprovado:true},buyer2:{nome:'Bruno Originador',perfil:'comprador',aprovado:true},weigher1:{nome:'Paulo Pesador',perfil:'pesador',aprovado:true,compradorUid:'buyer1',comprador:'Ana Originadora'},waiting:{nome:'Pedro Pesador',perfil:'pesador',aprovado:false},office1:{nome:'Olivia Escritório',perfil:'escritorio',aprovado:true},pendingOffice:{nome:'Escritório pendente',perfil:'escritorio',aprovado:false}},pesagens:{p1:pending,p2:{...pending,compradorUid:'buyer2',pesadorUid:'weigher2'}},romaneios:{old:{comprador:'Ana Originadora',pecuarista:'Legado',cabecas:'1',dataCompra:'2026-09-01'}},pecuaristas:{pec1:{nome:'João Pecuarista',documento:'123',banco:'Banco',agencia:'1',conta:'2'}},destinos:{dest1:{nome:'Fazenda GVQ',cidade:'Ibitinga',estado:'SP'}}}}}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.GVQ_CHROMIUM_PATH?{executablePath:process.env.GVQ_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 async function pageFor(uid,file,width=1280,data){
  const page=await browser.newPage({viewport:{width,height:900}}), errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.accept()});
  await page.addInitScript(mock=>{window.__mock=mock},seed(uid,data));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='www.gstatic.com')return route.fulfill({contentType:'application/javascript',body:firebaseMock});
   if(u.hostname==='servicodados.ibge.gov.br')return route.fulfill({contentType:'application/json',body:JSON.stringify(u.pathname.includes('municipios')?[{nome:'Barretos'}]:[{sigla:'SP',nome:'São Paulo'}])});
   if(u.hostname!=='gvq.local')return route.abort();
   if(u.pathname==='/js/firebase.js')return route.fulfill({contentType:'application/javascript',body:"export {auth,db,storage} from 'https://www.gstatic.com/mock.js';"});
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
 // Cadastro pendente e login bloqueado até designação.
 const {page:signup,errors:se}=await pageFor('new-user','index.html');
 await signup.getByRole('button',{name:'Nova conta',exact:true}).click();await signup.locator('#cad_nome').fill('Pedro Pesador');await signup.locator('#cad_perfil').selectOption('pesador');await signup.locator('#cad_senha').fill('senha-teste-123');await signup.locator('#btn-cadastrar').click();
 assert.equal(await signup.evaluate(()=>window.__mock.writes[0].data.aprovado),false);assert.deepEqual(se,[]);
 const {page:waiting}=await pageFor('waiting','pages/pesador.html');await waiting.waitForURL('**/index.html');
 console.log('PASS: pesador recém-cadastrado aguarda aprovação.');
 // Escritório aprova e vincula, com compatibilidade para contas antigas de comprador.
 const {page:office,errors:oe}=await pageFor('office1','pages/escritorio.html');
 await office.locator('#btn-tab-usuarios').click();const row=office.locator('#tbody-usuarios tr').filter({hasText:'Pedro Pesador'});
 await row.locator('select').selectOption('buyer2');await row.getByRole('button',{name:'Aprovar e vincular'}).click();
 assert.equal(await office.evaluate(()=>window.__mock.data.usuarios.waiting.compradorUid),'buyer2');
 assert.equal(await office.evaluate(()=>window.__mock.data.usuarios.waiting.aprovadoPor),'office1');assert.deepEqual(oe,[]);
 console.log('PASS: escritório designa originador e aprova pesador.');
 const {page:w,errors:we}=await pageFor('weigher1','pages/pesador.html');
 assert.equal(await w.locator('#rom_originador').inputValue(),'Ana Originadora');assert.equal(await w.locator('#rom_comprador').count(),0);
 assert.equal(await w.evaluate(()=>window.__mock.reads.some(r=>r.name==='usuarios'&&!r.id)),false);
 assert.equal(await w.locator('#rom_raca option[value="F1 Angus"],#rom_raca option[value="Europeu"]').count(),2);
 await fillOperacional(w);
 assert.equal(await w.locator('#rom_peso_medio').inputValue(),'325.25');
 assert.equal(await w.locator('#rom_cabecas').getAttribute('readonly'),null);
 await w.locator('#btn-registrar').click();await w.waitForTimeout(50);
 let writes=await w.evaluate(()=>window.__mock.writes);assert.equal(writes.length,1);assert.equal(writes[0].data.tipoPesagem,'balancao');assert.deepEqual(writes[0].data.pesosIndividuais,[]);
 assert.equal(writes[0].data.compradorUid,'buyer1');assert.ok(!('precoUnitario' in writes[0].data));assert.equal(await w.locator('#rom_peso_medio').inputValue(),'');assert.deepEqual(we,[]);
 console.log('PASS: pesagem por balanção sem individuais e sem valores; vínculo não selecionável.');
 // Upload inicial e pesos individuais também funcionam.
 const {page:wi,errors:wie}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(wi,true);
 await wi.locator('#input_arquivos').setInputFiles({name:'romaneio.pdf',mimeType:'application/pdf',buffer:Buffer.from('PDF teste')});await wi.locator('#btn-registrar').click();await wi.waitForTimeout(30);
 assert.equal(await wi.evaluate(()=>window.__mock.uploads.length),1);assert.equal(await wi.evaluate(()=>window.__mock.writes[0].data.anexosLinks[0].nomeArquivo),'romaneio.pdf');assert.deepEqual(wie,[]);
 console.log('PASS: pesos individuais e arquivo inicial com link persistido.');
 // Originador revisa um novo registro gerado pela tela do pesador.
 let data=await w.evaluate(()=>window.__mock.data);data.pesagens={p1:{...data.pesagens['new-id']}};
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
 console.log('PASS: originador preenche os campos obrigatórios e valida o registro.');
 // Documento posterior retira a compra do escritório e preserva negociação anterior para revalidação.
 data=await b.evaluate(()=>window.__mock.data);
 const {page:wc,errors:wce}=await pageFor('weigher1','pages/pesador.html',1280,data);
 await wc.evaluate(()=>window.mostrarTelaHistorico());await wc.getByRole('button',{name:'Anexar documentos'}).click();
 await wc.locator('#input_complementos').setInputFiles({name:'GTA.pdf',mimeType:'application/pdf',buffer:Buffer.from('GTA teste')});
 await wc.locator('#btn-complementar').click();await wc.waitForTimeout(40);
 assert.equal(await wc.evaluate(()=>window.__mock.data.pesagens.p1.revisao),2);assert.equal(await wc.evaluate(()=>window.__mock.data.romaneios.p1.status),'aguardando_revalidacao');
 assert.equal(await wc.evaluate(()=>window.__mock.reads.some(r=>r.name==='romaneios')),false);assert.deepEqual(wce,[]);
 data=await wc.evaluate(()=>window.__mock.data);
 const {page:oc}=await pageFor('office1','pages/escritorio.html',1280,data);
 assert.equal(await oc.locator('#tbody-romaneios input.chk-export').count(),1); // Só legado; p1 ainda em revalidação.
 assert.ok(!(await oc.locator('#tbody-romaneios').innerText()).includes('João Pecuarista'));
 const {page:br,errors:bre}=await pageFor('buyer1','pages/painel.html',1280,data);await br.getByRole('button',{name:'Revalidar',exact:true}).click();
 assert.equal(await br.locator('#rom_preco').inputValue(),'300');assert.equal(await br.locator('#rom_tipo_pesagem').inputValue(),'balancao');
 assert.equal(await br.locator('#lista-arquivos-ui a').count(),1);
 await br.locator('#btn-registrar').click();await br.waitForTimeout(40);
 assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.revisaoValidada),2);assert.equal(await br.evaluate(()=>window.__mock.data.romaneios.p1.anexosLinks.length),1);assert.deepEqual(bre,[]);
 console.log('PASS: complementação com upload simulado, bloqueio no escritório e revalidação sem perder negociação.');
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
 // Falha de upload não cria registro nem declara sucesso.
 const {page:fail,alerts:fa}=await pageFor('weigher1','pages/pesador.html');await fillOperacional(fail);await fail.evaluate(()=>window.__mock.failUpload=true);
 await fail.locator('#input_arquivos').setInputFiles({name:'GTA.pdf',mimeType:'application/pdf',buffer:Buffer.from('teste')});await fail.locator('#btn-registrar').click();await fail.waitForTimeout(20);
 assert.equal(await fail.evaluate(()=>window.__mock.writes.length),0);assert.ok(fa.some(a=>a.includes('Não foi possível enviar')));
 console.log('PASS: falha de upload preserva formulário e impede falso sucesso.');
 // URLs de outro perfil e contas não aprovadas são redirecionadas.
 for(const [uid,file,target] of [['weigher1','pages/painel.html','pesador.html'],['weigher1','pages/escritorio.html','pesador.html'],['buyer2','pages/pesador.html','painel.html'],['pendingOffice','pages/escritorio.html','index.html']]){const {page}=await pageFor(uid,file);await page.waitForURL('**/'+target);await page.close()}
 console.log('PASS: perfis antigos e novos respeitam os redirecionamentos.');
 // Obrigatoriedade: anexos e observações são opcionais; raça extra só quando Outra.
 const {page:required}=await pageFor('weigher1','pages/pesador.html');
 assert.deepEqual(await required.locator('#form-romaneio input:not([type=file]):not(#rom_raca_outra),#form-romaneio select').evaluateAll(els=>els.filter(e=>!e.required).map(e=>e.id)),[]);
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
  const {page:officePreview}=await pageFor('office1','pages/escritorio.html',width);await officePreview.locator('#btn-tab-usuarios').click();await officePreview.waitForTimeout(350);await officePreview.screenshot({path:path.join(root,'test-results','escritorio-'+width+'.png'),fullPage:true});
  console.log('PASS: estilos e telas em '+width+'px.');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
