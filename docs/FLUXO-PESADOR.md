# Fluxo pesador → comprador → escritório

## Uso

- Nova conta: selecionar **Pesador**. Mantém o padrão atual de aprovação automática das contas operacionais; escritório continua exigindo aprovação administrativa.
- Pesador: selecionar o **comprador responsável em cada romaneio**, preencher pecuarista, origem/destino, data da pesagem e pagamento, sexo, raça e pesos individuais. Cabeças e peso total vêm dos pesos confirmados. Enviar ao comprador.
- Comprador: **Compras pendentes → Conferir**. Verificar todos os dados, corrigir se necessário, incluir preço por kg, arroba ou cabeça e comissão. **Validar e enviar ao escritório**.
- Escritório: recebe apenas a versão conferida e com negociação preenchida. Histórico e exportações existentes continuam disponíveis.
- Pesador: acompanha o status no seu histórico, sem ler os dados financeiros. Os dados originais da sua pesagem permanecem como registro da origem; eventuais correções do comprador ficam na versão final enviada ao escritório.

Nenhuma regra CSS, fonte, cor ou espaçamento foi alterado. A tela nova reutiliza as mesmas classes, componentes e estrutura do painel atual. As únicas alterações de conteúdo são os controles necessários ao novo fluxo.

## Modelo e proteção

`pesagens/{id}` contém somente dados operacionais, autoria por UID, comprador responsável e status. `romaneios/{id}` passa a conter a versão final, valores e comissão; seu ID é o mesmo da pesagem. O pesador não possui leitura desta coleção. Não basta esconder os campos na tela: **as regras do Firestore são parte obrigatória da implantação**.

A validação usa uma transação: lê a pesagem atual, confere o comprador/status, cria o romaneio e atualiza a pesagem. O banco permite a mudança de status somente junto com a criação do romaneio correspondente. Assim, não há envio parcial nem duplicação ao validar simultaneamente.

Os vínculos usam `compradorUid` e `pesadorUid`, lidos do perfil autenticado, em vez de confiar no nome do localStorage. Acesso direto a URLs verifica o perfil e a aprovação no banco. As regras mantêm perfis imutáveis pelo próprio usuário.

## Implantação

1. Fazer backup das regras atuais do console Firebase e dos dados. As regras atuais não foram fornecidas no repositório; comparar com `firestore.rules` para preservar permissões de outras aplicações/coleções que eventualmente compartilhem o projeto.
2. Garantir que as contas operacionais existentes possuem `aprovado: true`. Contas de escritório não aprovadas continuam bloqueadas.
3. Conferir o vínculo dos romaneios antigos: documentos sem `compradorUid` continuam visíveis ao escritório; para aparecerem no histórico do comprador precisam do UID correto. Há um script administrativo com simulação padrão:

   ```sh
   npm install
   # Usar credenciais administrativas locais (Application Default Credentials).
   node scripts/vincular-historico.mjs --projeto=gvq-sistema-compras
   # Depois de revisar os vínculos:
   node scripts/vincular-historico.mjs --projeto=gvq-sistema-compras --aplicar
   ```

   Somente nomes que correspondem exatamente a um único comprador aprovado são vinculados. Ausências e nomes duplicados exigem conferência administrativa. O script não inventa autores nem modifica os dados originais da negociação.
4. Aplicar as regras revisadas ao projeto correto antes de liberar a versão com pesador:

   ```sh
   npx firebase-tools deploy --only firestore:rules --project gvq-sistema-compras
   ```

5. Publicar os arquivos do aplicativo e verificar o fluxo com contas dos três perfis. Esta alteração não publica automaticamente o aplicativo nem aplica regras no projeto real.

## Verificação local

Requer Node 22+ e Java 17+ para a versão de firebase-tools fixada em package.json.

```sh
npm install
npm test
npm run test:rules
npx playwright install chromium
npm run test:browser
```

O teste de regras usa exclusivamente `demo-gvq-tests` no emulador. O teste de navegador intercepta Firebase, IBGE e recursos externos, usando dados simulados; nunca grava no Firebase real. Para comparar com uma revisão específica do layout: `GVQ_BASE_REF=SHA_ANTERIOR npm run test:browser`. Pode-se indicar Chromium instalado por `GVQ_CHROMIUM_PATH`.

## Limite já existente

Os anexos continuam com o comportamento atual: só seus nomes são salvos. Esta mudança preserva esses nomes no encaminhamento, mas não implementa envio dos arquivos para Storage. Notas e anexos adicionais da negociação ficam apenas no documento do comprador/escritório.
