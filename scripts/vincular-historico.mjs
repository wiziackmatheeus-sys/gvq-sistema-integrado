// Execução administrativa e opcional, nunca chamada pelo aplicativo.
// Sem --aplicar, apenas conta os vínculos possíveis. Não altera nenhum documento.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const args = process.argv.slice(2);
const projeto = args.find(a => a.startsWith('--projeto='))?.slice('--projeto='.length);
if (!projeto) throw new Error('Informe explicitamente --projeto=ID_DO_PROJETO. Sem --aplicar, é apenas simulação.');
initializeApp({ credential: applicationDefault(), projectId: projeto });
const db = getFirestore();
const [usuarios, romaneios] = await Promise.all([
    db.collection('usuarios').where('perfil', '==', 'comprador').where('aprovado', '==', true).get(),
    db.collection('romaneios').get()
]);
const porNome = new Map();
usuarios.forEach(u => { const nome = u.data().nome; porNome.set(nome, [...(porNome.get(nome) || []), u.id]); });
const vinculos = [];
let revisar = 0;
romaneios.forEach(r => {
    const dados = r.data();
    if (dados.compradorUid) return;
    const candidatos = porNome.get(dados.comprador) || [];
    if (candidatos.length === 1) vinculos.push({ ref: r.ref, uid: candidatos[0], updateTime: r.updateTime });
    else revisar++;
});
console.log(`${vinculos.length} registros com correspondência única; ${revisar} precisam de revisão administrativa (nome ausente ou duplicado).`);
if (!args.includes('--aplicar')) for (const { ref, uid } of vinculos) console.log(`${ref.path} → usuarios/${uid}`);
if (args.includes('--aplicar')) {
    for (let inicio = 0; inicio < vinculos.length; inicio += 400) {
        const batch = db.batch();
        for (const { ref, uid, updateTime } of vinculos.slice(inicio, inicio + 400)) batch.update(ref, { compradorUid: uid }, { lastUpdateTime: updateTime });
        await batch.commit();
    }
    console.log('Vínculos aplicados. Nenhum valor, nome ou status foi alterado.');
} else {
    console.log('Simulação concluída. Use --aplicar apenas depois de revisar as correspondências.');
}
