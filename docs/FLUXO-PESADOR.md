# Pesador → originador → escritório

## Cadastro e aprovação

O escritório também pode criar contas já aprovadas/vinculadas e redefinir senhas pela aba **Usuários**, com senha temporária e troca obrigatória. Esse recurso exige publicar as Cloud Functions e as novas regras Firestore/Storage. Ver [contas administrativas](CONTAS-ADMIN.md).

Todos os cadastros novos são feitos pelo escritório na aba **Usuários**, com perfil Pesador, Originador ou Escritório. O pesador já recebe aprovação e vínculo com o originador na criação, e uma senha temporária para trocar no primeiro acesso. A conta de escritório nova já é aprovada por quem a criou; não existe cadastro público nesta versão. As solicitações antigas de pesadores continuam na aba Usuários para **Aprovar e vincular**. Solicitações antigas de escritório não são aprovadas automaticamente e continuam exigindo aprovação administrativa no Firebase.

Pesadores aprovados visualizam apenas o nome do originador designado. Não consultam a lista de usuários nem escolhem outro responsável. O vínculo pode ser atualizado pelo escritório; registros já enviados continuam com o originador original e somente os novos registros usam o novo vínculo.

As contas antigas com `perfil: comprador` continuam funcionando como originadores. O cadastro novo utiliza `perfil: originador`. Os campos internos `compradorUid`, `comprador` e o status `aguardando_comprador` são preservados por compatibilidade com dados existentes; nos textos e controles da aplicação o termo é **originador**.

Pesadores criados na versão anterior, mesmo com `aprovado: true`, precisam receber um vínculo pelo escritório antes de entrar.

## Pesagem e campos obrigatórios

- **Balanção:** preencher quantidade de cabeças e peso total; não exige pesos individuais.
- **Individual:** lançar e confirmar os pesos na grade. Cabeças e peso total precisam corresponder à grade. Para usar o total do balanção em vez da grade, selecionar Balanção; os pesos individuais são retirados desse lançamento.
- **Peso médio:** calculado automaticamente por peso total ÷ cabeças, com duas casas decimais. É salvo e incluído na exportação geral.
- As raças incluem Brangus, Nelore, Cruzado, **F1 Angus**, **Europeu** e Outra.
- Origem, destino, dados do pecuarista, datas, sexo, raça, cabeças e peso total são obrigatórios. Cadastros de pecuaristas e destinos incompletos precisam ser corrigidos pelo escritório.
- Na negociação, o originador também informa preço, unidade, corretor e comissão. Quando não houver corretor, preencher **Sem corretor**; sem comissão, selecionar Nenhuma e informar zero.
- Somente anexos e observações são opcionais. Filtros de pesquisa e os campos individuais de uma pesagem por balanção não são informações obrigatórias do cadastro.

Nenhum CSS, fonte, cor ou espaçamento foi alterado. Os campos e telas novos reutilizam os componentes existentes.

## Documentos e revalidação

Os arquivos novos são enviados ao Firebase Storage, com caminho único e URL de acesso. O registro só declara sucesso depois do upload e da gravação dos metadados. Se o envio falhar, os dados do formulário permanecem e a compra não é confirmada. Limite por arquivo: 25 MB.

No histórico do pesador, **Anexar documentos** permite complementar qualquer pesagem dele. A complementação acrescenta arquivos, preserva os anteriores e incrementa a revisão. Se a compra já foi aprovada, a mesma transação marca sua versão financeira como **aguardando revalidação**. Ela sai da lista e das exportações do escritório até o originador clicar em **Revalidar**, conferir os novos arquivos e confirmar novamente. Os valores e as correções da negociação anterior são preenchidos para a nova conferência.

O pesador não lê nem modifica os valores. A única alteração permitida a ele no documento financeiro é a marca de revalidação, junto com a complementação dos documentos operacionais. A última versão financeira já aprovada permanece armazenada enquanto aguarda revisão; o escritório não recebe os arquivos novos antes da revalidação. O pesador continua vendo somente os arquivos operacionais, sem os anexos privados da negociação.

Cada validação verifica a revisão atual, evitando que um originador confirme uma pesagem enquanto novos arquivos são acrescentados. Documentos vinculados não podem ser sobrescritos ou apagados pelo cliente. Uploads sem vínculo permitem limpeza pelo autor em caso de falha antes da gravação.

Arquivos antigos que eram guardados somente pelo nome não são recuperáveis por esta alteração. Os nomes são preservados e os arquivos podem ser anexados novamente pelo pesador.

## Documentos por tipo e filtros do escritório

O envio inicial e a complementação do pesador, assim como a conferência do originador, têm espaços separados para **Nota fiscal, GTA, Romaneio manual, Foto do gado, Vídeo do gado, Foto da carreta e Outros**. Todos são opcionais e aceitam mais de um arquivo. Cada arquivo guarda sua categoria; arquivos antigos sem categoria aparecem em Outros. As fotos e vídeos têm seletores adequados ao tipo de mídia. Continua valendo o limite de 25 MB por arquivo, inclusive vídeos.

Os espaços mostram quantos arquivos estão disponíveis e quais ainda não foram anexados, sem bloquear a compra. A lista identifica a categoria e o nome de cada arquivo. No escritório, expandir **Documentos** permite consultar as sete categorias, abrir os arquivos e ver Não anexado (opcional). O envio posterior conserva as categorias e segue o fluxo existente de revalidação pelo originador.

Acima da tabela do escritório há filtros combinados por código da compra (inclusive parte do código), fazenda de destino, originador, etapa e mês da data da compra. A contagem informa resultados e total. **Limpar filtros** restaura a lista. Ao filtrar ou atualizar os dados, a seleção das compras é limpa; Selecionar todos abrange somente as linhas visíveis e a exportação considera essas linhas selecionadas. Compras antigas sem UID de originador continuam filtráveis pelo nome. Os filtros continuam aplicados durante atualizações em tempo real.

Esta alteração não muda as regras de acesso nem cria exigência de documentos. Mantém os estilos existentes. A configuração do Storage e as regras Firestore/Storage das versões anteriores continuam necessárias.

## Identificação automática da compra

Na primeira validação pelo originador, o app gera `codigoCompra` no formato `OC-FAZENDA-AAAAMM-ID`: nome da fazenda de destino sem acentos/espaços (até 24 caracteres), ano/mês da data da compra e ID completo do registro. Exemplo: `OC-SAO-JOSE-202610-AbCd1234EFgh5678IjKl`. O ID completo distingue compras simultâneas da mesma fazenda/mês sem depender de contador. O mês não depende do relógio ou fuso de quem abre a tela.

O código é automático, sem campo para edição. Fica abaixo do pecuarista na tabela do escritório, com o texto completo ao passar o mouse, e no título do histórico. A coluna **Ordem de Compra** é incluída nas duas exportações CSV compatíveis com Excel (compras e pesos); o ID interno também é mantido. Revalidações preservam o código original, mesmo se forem corrigidos o destino ou a data. As regras impedem alterar um código já gravado.

Compras antigas sem código recebem uma identificação calculada ao visualizar/exportar, sem migração em massa. Para essas compras, o código é calculado com seus dados atuais; registros sem fazenda ou data usam `FAZENDA` e `SEM-DATA`. Na próxima revalidação de um registro antigo, o código é gravado. É necessário publicar as novas regras Firestore junto com a atualização do app.

## Etapas do escritório

A coluna **Etapa do escritório** usa as tags existentes como seletor. Toda compra validada pelo originador chega como **Recebida**. Ao selecionar **Em andamento**, a pessoa do escritório assume o atendimento e seu nome fica visível. Depois pode selecionar **Finalizada**, registrando quem finalizou e quando. Uma compra finalizada pode ser reaberta em **Em andamento**; quem reabre assume o atendimento. Não é permitido pular diretamente de Recebida para Finalizada.

O botão **Histórico** mostra cada recebimento, início, finalização e reabertura, com responsável, data/hora e revisão. Os eventos ficam em `romaneios/{id}/historicoEscritorio` e não podem ser editados ou apagados pelo cliente. A alteração da etapa e seu evento são gravados juntos. A exportação geral inclui etapa, responsável e quem finalizou.

Se o pesador anexar documentos depois de uma finalização, a compra fica aguardando revalidação e sai temporariamente da lista do escritório. O originador vê **Novos documentos** e **Revalidar**. Depois da confirmação, ela retorna ao escritório como **Recebida**, com **Nova revisão de documentos**. A finalização anterior permanece no histórico; a nova revisão precisa ser processada novamente. Registros antigos sem etapa aparecem como Recebida, sem inventar eventos anteriores.

**Esta versão exige publicar novamente `firestore.rules` junto com os arquivos do app.** As regras antigas não autorizam as etapas e o histórico novos. Não houve alteração no banco de produção durante o desenvolvimento.

## Modelo de acesso

`usuarios/{uid}` contém a aprovação e o vínculo do pesador. Somente o próprio usuário e o escritório leem o perfil; somente o escritório aprovado pode atribuir um originador ao pesador.

`pesagens/{id}` contém os dados operacionais originais, `revisao`, anexos do pesador e status. Apenas seu autor e seu originador têm leitura. `romaneios/{id}` contém a versão final, valores, comissão, `revisaoValidada` e anexos da negociação. O pesador não tem leitura dessa coleção. A validação ou revalidação grava o romaneio e o status da pesagem em uma transação.

No Storage, `pesagens/{id}/{pesadorUid}/{arquivo}` guarda os documentos operacionais; `negociacoes/{id}/{originadorUid}/{arquivo}` guarda documentos privados do originador. O escritório lê arquivos apenas de pesagens finalizadas. As regras de Firestore e Storage são parte obrigatória da implantação.

## Implantação

1. Fazer backup dos dados e das regras atuais de Firestore/Storage. As regras publicadas no projeto não estão acessíveis por este repositório; comparar antes de aplicar para preservar permissões de outras aplicações ou coleções.
2. **Ativar/configurar o bucket Firebase Storage do projeto** antes de testar arquivos em produção. Confirmar os requisitos de faturamento no console. Na primeira publicação de regras do Storage com consulta ao Firestore, autorizar a permissão entre serviços solicitada pelo Firebase. Esta mudança não altera automaticamente o console nem o faturamento.
3. Garantir que originadores existentes possuem `aprovado: true` e que o escritório possui uma conta aprovada. Vincular os pesadores pela aba Usuários.
4. Romaneios antigos sem `compradorUid` continuam no escritório; para voltarem ao histórico individual, revisar o vínculo por UID. Há simulação administrativa:

   ```sh
   npm install
   node scripts/vincular-historico.mjs --projeto=gvq-sistema-compras
   # Somente depois de conferir os vínculos, com credenciais administrativas locais:
   node scripts/vincular-historico.mjs --projeto=gvq-sistema-compras --aplicar
   ```

   Somente correspondências únicas de nomes são vinculadas. O script não aprova pesadores nem altera as negociações.
5. Aplicar as regras revisadas e publicar os arquivos da aplicação na mesma janela de atualização:

   ```sh
   npx firebase-tools deploy --only firestore:rules,storage --project gvq-sistema-compras
   ```

6. Validar cadastro → aprovação/vínculo → balanção/individual → negociação → escritório → documento posterior → revalidação. Nada disso foi executado no banco de produção durante o desenvolvimento.

## Testes locais

Requer Node 22+ e Java 17+ para a versão de firebase-tools fixada em package.json.

```sh
npm install
npm test
npm run test:rules
npm run test:storage
npx playwright install chromium
npm run test:browser
```

As regras usam emuladores no projeto `demo-gvq-tests`. O navegador usa Firebase, Storage e IBGE simulados. Nenhum teste grava em produção. Para comparar estilos com uma revisão anterior, definir `GVQ_BASE_REF=SHA_ANTERIOR`; para utilizar Chromium já instalado, definir `GVQ_CHROMIUM_PATH`.

A aplicação continua usando Firebase até uma futura migração para MySQL, que precisará transportar também autenticação, permissões e armazenamento dos arquivos.
