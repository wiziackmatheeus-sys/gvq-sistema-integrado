import { before, after, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
let env;
const d = uid => env.authenticatedContext(uid).storage();
const file = new Uint8Array([80, 68, 70]);
before(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-gvq-tests',
        firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
        storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
        async function limpar(pasta) {
            const { items, prefixes } = await pasta.listAll();
            await Promise.all([...items.map(item => item.delete()), ...prefixes.map(limpar)]);
        }
        await limpar(c.storage().ref());
    });
    await env.withSecurityRulesDisabled(async c => {
        const db = c.firestore();
        for (const [uid, data] of Object.entries({
            weigher1: { nome: 'Paulo', perfil: 'pesador', aprovado: true, compradorUid: 'buyer1' },
            weigher2: { nome: 'Pedro', perfil: 'pesador', aprovado: true, compradorUid: 'buyer2' },
            waiting: { nome: 'Pendente', perfil: 'pesador', aprovado: false },
            buyer1: { nome: 'Ana', perfil: 'originador', aprovado: true },
            buyer2: { nome: 'Bruno', perfil: 'comprador', aprovado: true },
            office1: { nome: 'Olivia', perfil: 'escritorio', aprovado: true }
        })) await setDoc(doc(db, 'usuarios', uid), data);
        await setDoc(doc(db, 'pesagens', 'p1'), { pesadorUid: 'weigher1', compradorUid: 'buyer1', status: 'aguardando_comprador', anexosCaminhos: [] });
    });
});
test('pesador aprovado envia antes do registro inicial; pendentes e outros autores não enviam', async () => {
    await assertSucceeds(uploadBytes(ref(d('weigher1'), 'pesagens/novo/weigher1/arquivo'), file));
    await assertFails(uploadBytes(ref(d('waiting'), 'pesagens/novo/waiting/arquivo'), file));
    await assertFails(uploadBytes(ref(d('weigher2'), 'pesagens/p1/weigher1/arquivo'), file));
});
test('pesagem enviada é legível só pelo autor e originador; escritório aguarda a validação', async () => {
    const path = 'pesagens/p1/weigher1/GTA';
    await assertSucceeds(uploadBytes(ref(d('weigher1'), path), file));
    await assertSucceeds(getBytes(ref(d('weigher1'), path)));
    await assertSucceeds(getBytes(ref(d('buyer1'), path)));
    await assertFails(getBytes(ref(d('buyer2'), path)));
    await assertFails(getBytes(ref(d('office1'), path)));
    await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'pesagens', 'p1'), { status: 'enviado_escritorio' }));
    await assertSucceeds(getBytes(ref(d('office1'), path)));
});
test('arquivo da negociação nunca é legível nem gravável pelo pesador', async () => {
    const path = 'negociacoes/p1/buyer1/contrato';
    await assertSucceeds(uploadBytes(ref(d('buyer1'), path), file));
    await assertFails(getBytes(ref(d('weigher1'), path)));
    await assertFails(uploadBytes(ref(d('weigher1'), path), file));
    await assertFails(getBytes(ref(d('buyer2'), path)));
    await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'pesagens', 'p1'), { status: 'enviado_escritorio' }));
    await assertSucceeds(getBytes(ref(d('office1'), path)));
});
test('documentos já vinculados são imutáveis; uploads órfãos permitem limpeza pelo autor', async () => {
    const path = 'pesagens/p1/weigher1/GTA';
    await uploadBytes(ref(d('weigher1'), path), file);
    await assertFails(uploadBytes(ref(d('weigher1'), path), file));
    await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'pesagens', 'p1'), { anexosCaminhos: [path] }));
    await assertFails(deleteObject(ref(d('weigher1'), path)));
    const orphan = 'pesagens/p1/weigher1/orfao';
    await uploadBytes(ref(d('weigher1'), orphan), file);
    await assertSucceeds(deleteObject(ref(d('weigher1'), orphan)));
});
