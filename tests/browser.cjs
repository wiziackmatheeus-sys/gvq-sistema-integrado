const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const baseline = process.env.GVQ_BASE_REF;
const original = baseline ? require('child_process').execFileSync('git',['show',baseline+':pages/painel.html'],{cwd:root,encoding:'utf8'}) : null;
const firebaseMock = `
const h = () => window.__mock;
export const auth = {currentUser:{uid:'unused'}, signOut:async()=>{h().signedOut=true;}};
export const db = {};
export function onAuthStateChanged(auth, callback) { queueMicrotask(() => callback({uid:h().uid})); return ()=>{}; }
export async function signOut() {}
export function collection(db, name) { return {name}; }
export function doc(db, name, id) {return {name,id};}
export function where(field,op,value) {return {field,value};}
export function orderBy() {return {};}
export function query(col,...filters) {return {...col,filters};}
export function serverTimestamp(){return 'SERVER_TIME';}
function snap(name,id) { const data=h().data[name]?.[id];return {id,exists:()=>!!data,data:()=>structuredClone(data)}; }
export async function getDoc(ref) {h().reads.push(ref); return snap(ref.name,ref.id);}
export function onSnapshot(ref, callback, error) {
 h().reads.push(ref);
 const docs = Object.entries(h().data[ref.name]||{}).filter(([id,d])=>(ref.filters||[]).every(f=>!f.field||d[f.field]===f.value)).map(([id])=>snap(ref.name,id));
 callback({docs,empty:!docs.length,forEach:f=>docs.forEach(f)}); return ()=>{};
}
export async function addDoc(ref,data) { h().writes.push({name:ref.name,data}); h().data[ref.name] ??= {};h().data[ref.name]['new-id']=structuredClone(data);return {id:'new-id'}; }
export async function runTransaction(db,callback) {
 const staged=[];
 await callback({get:async ref=>snap(ref.name,ref.id),set:(ref,data)=>staged.push({ref,data,kind:'set'}),update:(ref,data)=>staged.push({ref,data,kind:'update'})});
 for(const w of staged) { h().data[w.ref.name]??={};h().data[w.ref.name][w.ref.id]=w.kind==='update'?{...h().data[w.ref.name][w.ref.id],...structuredClone(w.data)}:structuredClone(w.data);h().writes.push({name:w.ref.name,id:w.ref.id,data:w.data}); }
}
export async function signInWithEmailAndPassword(auth,email,password) { return {user:{uid:h().uid}}; }
export async function createUserWithEmailAndPassword(auth,email,password) {return {user:{uid:h().uid}};}
export async function setDoc(ref,data) {h().writes.push({name:ref.name,id:ref.id,data});}
`;
const pending={estado:'SP',cidade:'Barretos',fazendaDestino:'Fazenda GVQ',cidadeDestino:'Ibitinga',ufDestino:'SP',pecuarista:'João Pecuarista',dataCompra:'2026-10-19',dataPagamento:'2026-10-23',cabecas:'2',pesoTotal:'650.50',sexo:'Macho',raca:'Nelore',pesosIndividuais:[300,350.5],observacoes:'Conferir lote',anexos:['GTA.pdf'],compradorUid:'buyer1',comprador:'Ana Compradora',pesadorUid:'weigher1',pesador:'Paulo Pesador',status:'aguardando_comprador',timestamp:'BASE_TIME'};
function seed(role,uid) {return {uid,reads:[],writes:[],data:{usuarios:{buyer1:{nome:'Ana Compradora',perfil:'comprador',aprovado:true},buyer2:{nome:'Bruno Comprador',perfil:'comprador',aprovado:true},weigher1:{nome:'Paulo Pesador',perfil:'pesador',aprovado:true},office1:{nome:'Olivia Escritório',perfil:'escritorio',aprovado:true},pendingOffice:{nome:'Pendente',perfil:'escritorio',aprovado:false}},pesagens:{p1:pending,p2:{...pending,compradorUid:'buyer2',pesadorUid:'weigher2'}},romaneios:{old:{comprador:'Ana Compradora',pecuarista:'Legado',cabecas:'1',dataCompra:'2026-09-01'}},pecuaristas:{pec1:{nome:'João Pecuarista',documento:'123',banco:'Banco',agencia:'1',conta:'2'}},destinos:{dest1:{nome:'Fazenda GVQ',cidade:'Ibitinga',estado:'SP'}}}};}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.GVQ_CHROMIUM_PATH ? {executablePath:process.env.GVQ_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']} : {})});
 async function pageFor(role,uid,file,width=1280) {
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];const alerts=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
   await page.addInitScript(mock=>{window.__mock=mock;},seed(role,uid));
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='www.gstatic.com')return route.fulfill({contentType:'application/javascript',body:firebaseMock});
    if(u.hostname==='servicodados.ibge.gov.br')return route.fulfill({contentType:'application/json',body:JSON.stringify(u.pathname.includes('municipios')?[{nome:'Barretos'}]:[{sigla:'SP',nome:'São Paulo'}])});
    if(u.hostname!=='gvq.local')return route.abort();
    if(u.pathname==='/js/firebase.js')return route.fulfill({contentType:'application/javascript',body:"export {auth,db} from 'https://www.gstatic.com/mock.js';"});
    if(original && u.pathname==='/original.html')return route.fulfill({contentType:'text/html',body:original.replaceAll('../','/').replace(/<script[^>]+src="\/js\/painel.js"><\/script>/,'')});
    const f=path.join(root,u.pathname);
    if(!fs.existsSync(f))return route.fulfill({status:404,body:''});
    const ext=path.extname(f);return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[ext]||'text/plain',body:fs.readFileSync(f)});
   });
   await page.goto('https://gvq.local/'+file);await page.waitForTimeout(100);
   return {page,errors,alerts};
 }
 // Cadastro e login incluem o terceiro perfil.
 let {page:signup,errors:signupErrors}=await pageFor('', 'new-user', 'index.html');
 await signup.getByRole('button',{name:'Nova conta',exact:true}).click();
 await signup.locator('#cad_nome').fill('Pedro Pesador');
 await signup.locator('#cad_perfil').selectOption('pesador');
 await signup.locator('#cad_senha').fill('senha-teste-123');
 await signup.locator('#btn-cadastrar').click();await signup.waitForTimeout(30);
 assert.equal(await signup.evaluate(()=>window.__mock.writes[0].data.perfil),'pesador');
 assert.equal(await signup.evaluate(()=>window.__mock.writes[0].data.aprovado),true);
 assert.equal(await signup.evaluate(()=>window.__mock.signedOut),true);
 assert.deepEqual(signupErrors,[]);
 let {page:login}=await pageFor('pesador','weigher1','index.html');
 await login.locator('#login_usuario').fill('paulo.pesador');await login.locator('#login_senha').fill('senha-teste-123');
 await login.locator('#btn-entrar').click();await login.waitForURL('**/pages/pesador.html');
 console.log('PASS: cadastro e login do perfil pesador.');
 // Pesador só carrega seus registros e nunca lê documentos financeiros.
 let {page:w,errors:we,alerts:wa}=await pageFor('pesador','weigher1','pages/pesador.html');
 await assert.doesNotReject(()=>w.getByText('Olá, Paulo').waitFor());
 assert.equal(await w.locator('#rom_preco,#rom_corretor,#rom_valor_total').count(),0);
 assert.deepEqual(await w.evaluate(()=>window.__mock.reads.filter(r=>r.name==='romaneios')),[]);
 assert.equal(await w.locator('#rom_comprador option').count(),3);
 await w.locator('#rom_comprador').selectOption('buyer1');
 await w.locator('#rom_uf').selectOption('SP');
 await w.locator('#rom_cidade').fill('Barretos');
 await w.locator('#lista_cidades_ui .autocomplete-item').click();
 await w.locator('#rom_fazenda_destino').fill('Fazenda');await w.locator('#lista_destinos_ui .autocomplete-item').click();
 await w.locator('#rom_busca_pec').fill('João');await w.locator('#lista_pecuaristas_ui .autocomplete-item').click();
 await w.locator('#rom_data_compra').fill('2026-10-19');await w.locator('#rom_data_pag').fill('2026-10-23');
 await w.locator('#rom_sexo').selectOption('Macho');await w.locator('#rom_raca').selectOption('Nelore');
 await w.evaluate(()=>window.mostrarTelaPesagem());await w.locator('#peso_ind_1').fill('300');await w.locator('#peso_ind_2').fill('350.5');await w.evaluate(()=>window.salvarPesosGrid());
 await w.locator('#btn-registrar').click();await w.waitForTimeout(50);
 let writes=await w.evaluate(()=>window.__mock.writes);
 assert.equal(writes.length,1);assert.equal(writes[0].name,'pesagens');assert.equal(writes[0].data.compradorUid,'buyer1');assert.equal(writes[0].data.status,'aguardando_comprador');
 for(const key of ['precoUnitario','unidadePreco','valorTotalGado','corretor','tipoComissao','valorComissao','totalComissao'])assert.ok(!(key in writes[0].data),key);
 assert.equal(await w.locator('#peso_ind_1').inputValue(),'');
 assert.equal(await w.locator('#grid_lbl_cab').innerText(),'0');
 assert.deepEqual(we,[]);
 console.log('PASS: pesador registra somente dados operacionais, comprador escolhido e grade limpa.');
 // Comprador vê somente sua fila; revisa os dados e inclui o preço.
 let {page:b,errors:be,alerts:ba}=await pageFor('comprador','buyer1','pages/painel.html');
 assert.equal(await b.locator('#tbody-pendentes button').count(),1);
 await b.getByRole('button',{name:'Conferir',exact:true}).click();
 assert.equal(await b.locator('#rom_cabecas').inputValue(),'2');
 assert.equal(await b.locator('#peso_ind_2').inputValue(),'350.5');
 assert.equal(await b.locator('#rom_data_pag').inputValue(),'2026-10-23');
 assert.equal(await b.locator('#rom_preco').inputValue(),'');
 await b.locator('#btn-registrar').click();await b.waitForTimeout(30);
 assert.equal(await b.evaluate(()=>window.__mock.writes.length),0);
 assert.ok(ba.some(a=>a.includes('preço maior')));
 await b.locator('#rom_preco').fill('12');
 assert.equal(await b.locator('#rom_valor_total').inputValue(),'R$\u00a07.806,00');
 await b.locator('#rom_unidade_preco').selectOption('Por Arroba');await b.locator('#rom_preco').fill('300');
 assert.equal(await b.locator('#rom_valor_total').inputValue(),'R$\u00a06.505,00');
 await b.locator('#rom_obs').fill('Negociação: prazo confirmado');
 await b.locator('#btn-registrar').click();await b.waitForTimeout(50);
 writes=await b.evaluate(()=>window.__mock.writes);
 assert.equal(writes.length,2);assert.equal(writes[0].name,'romaneios');assert.equal(writes[0].id,'p1');
 assert.equal(writes[0].data.valorTotalGado,'R$\u00a06.505,00');assert.equal(writes[0].data.pesadorUid,'weigher1');
 assert.deepEqual(Object.keys(writes[1].data).sort(),['status','validadoEm']);
 assert.equal(await b.evaluate(()=>window.__mock.data.pesagens.p1.observacoes),'Conferir lote');
 assert.deepEqual(be,[]);
 // Uma segunda sessão com dados antigos não gera outro romaneio.
 await b.evaluate(()=>window.mostrarPendentes());await b.getByRole('button',{name:'Conferir',exact:true}).click();
 assert.ok(ba.some(a=>a.includes('indisponível')));assert.equal(await b.evaluate(()=>window.__mock.writes.length),2);
 console.log('PASS: comprador confere, calcula Kg/arroba, valida atomicamente e bloqueia duplicação.');
 // Campos alterados depois da abertura exigem nova conferência.
 let {page:stale,alerts:sa}=await pageFor('comprador','buyer1','pages/painel.html');
 await stale.getByRole('button',{name:'Conferir',exact:true}).click();await stale.locator('#rom_preco').fill('12');
 await stale.evaluate(()=>window.__mock.data.pesagens.p1.pesoTotal='999');await stale.locator('#btn-registrar').click();
 assert.equal(await stale.evaluate(()=>window.__mock.writes.length),0);assert.ok(sa.some(a=>a.includes('alterada')));
 console.log('PASS: dados desatualizados não são aprovados silenciosamente.');
 // Escritório consulta apenas romaneios finais; legado continua visível.
 let {page:o,errors:oe}=await pageFor('escritorio','office1','pages/escritorio.html');
 assert.equal(await o.locator('#tbody-romaneios tr').count(),1);assert.ok((await o.locator('#tbody-romaneios').innerText()).includes('Legado'));
 assert.equal(await o.evaluate(()=>window.__mock.reads.some(r=>r.name==='pesagens')),false);assert.deepEqual(oe,[]);
 console.log('PASS: escritório não consulta pesagens pendentes; mantém registros anteriores.');
 for(const [uid,file,target] of [['weigher1','pages/painel.html','pesador.html'],['weigher1','pages/escritorio.html','pesador.html'],['buyer1','pages/pesador.html','painel.html'],['pendingOffice','pages/escritorio.html','index.html']]){
  const {page}=await pageFor('',uid,file);await page.waitForURL('**/'+target);await page.close();
 }
 console.log('PASS: URLs diretas respeitam perfil e aprovação.');
 // Comparação computada do formulário existente: nenhum CSS, fonte, cor ou tamanho mudou.
 if (original) for(const width of [1280,375]) {
   const {page:before}=await pageFor('comprador','buyer1','original.html',width);
   const {page:after}=await pageFor('comprador','buyer1','pages/painel.html',width);
   await after.getByRole('button',{name:'Conferir',exact:true}).click();
   await before.locator('#rom_uf').evaluate(el=>{el.add(new Option('SP','SP'));el.value='SP';});
   const selectors=['.sidebar','.conteudo-inner','#form-romaneio .card','#rom_uf','#rom_preco','#rom_valor_total','#btn-registrar'];
   const props=['fontFamily','fontSize','fontWeight','color','backgroundColor','padding','borderRadius','gap','width'];
   for(const selector of selectors) {
    const styles=page=>page.locator(selector).first().evaluate((el,props)=>Object.fromEntries(props.map(k=>[k,getComputedStyle(el)[k]])),props);
    assert.deepEqual(await styles(after),await styles(before),width+': '+selector);
   }
   await after.screenshot({path:path.join(root,'test-results','comprador-'+width+'.png'),fullPage:true});
   const {page:pesador}=await pageFor('pesador','weigher1','pages/pesador.html',width);
   await pesador.screenshot({path:path.join(root,'test-results','pesador-'+width+'.png'),fullPage:true});
   console.log('PASS: estilos computados preservados em '+width+'px.');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
