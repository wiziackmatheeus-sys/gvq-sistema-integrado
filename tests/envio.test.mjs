import test from 'node:test';
import assert from 'node:assert/strict';
import { comPrazo, acompanharUpload } from '../js/controle-envio.js';

test('esperas devolvem resultado ou erro original e encerram espera sem resposta', async () => {
    assert.equal(await comPrazo(Promise.resolve(7), 'Sem resposta'), 7);
    await assert.rejects(comPrazo(Promise.reject(new Error('Permissão negada')), 'Sem resposta'), /Permissão negada/);
    await assert.rejects(comPrazo(new Promise(() => {}), 'Sem resposta', { ms: 5 }), /Sem resposta/);
});
test('prazo de gravação sinaliza resultado incerto e aceita confirmação tardia sem rejeição solta', async () => {
    let confirmar;
    const gravacao = new Promise(resolve => { confirmar = resolve; });
    await assert.rejects(comPrazo(gravacao, 'Não confirmado', { ms: 5, resultadoIncerto: true }), e => e.resultadoIncerto === true);
    confirmar('Gravado'); assert.equal(await gravacao, 'Gravado');
});
test('upload parado cancela a tarefa e retira a escuta', async () => {
    let cancelamentos = 0, retiradas = 0;
    const tarefa = { cancel: () => { cancelamentos++; }, on: () => () => { retiradas++; } };
    await assert.rejects(acompanharUpload(tarefa, null, { inatividadeMs: 5, totalMs: 100 }), /não respondeu a tempo/);
    assert.equal(cancelamentos, 1); assert.equal(retiradas, 1);
});
test('upload com progresso conclui e não cancela tarefa concluída', async () => {
    let cancelamentos = 0;
    const percentuais = [];
    const tarefa = { snapshot: { totalBytes: 100, bytesTransferred: 100 }, cancel: () => { cancelamentos++; },
        on: (evento, progresso, erro, completo) => {
            queueMicrotask(() => { progresso({ bytesTransferred: 50, totalBytes: 100 }); progresso(tarefa.snapshot); completo(); });
            return () => {};
        }
    };
    assert.equal(await acompanharUpload(tarefa, p => percentuais.push(p)), tarefa.snapshot);
    assert.deepEqual(percentuais, [50, 100]); assert.equal(cancelamentos, 0);
});
