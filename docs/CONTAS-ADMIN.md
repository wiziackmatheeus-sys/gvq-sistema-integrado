# Cadastro e aprovação de contas

## Uso

Há dois caminhos para cadastrar **Pesador**, **Originador** e **Escritório**:

- **Autocadastro:** a pessoa abre **Cadastrar** na tela inicial e informa nome, usuário, perfil e senha. O perfil é criado com `aprovado: false`, e a sessão é encerrada. O escritório aprova o pedido na aba **Usuários**, usando o filtro **Aguardando aprovação**. Pesadores exigem a definição do originador responsável; os demais usam **Aprovar cadastro**. Aprovar um escritório concede as mesmas permissões de gestão e pede confirmação.
- **Cadastro direto pelo escritório:** permanece na aba **Usuários**. A criação já registra a aprovação e o UID/data de quem autorizou, mantendo senha temporária e troca obrigatória no primeiro acesso.

A primeira conta de escritório precisa existir e estar aprovada. Nenhum autocadastro libera acesso automaticamente, mesmo com perfil de escritório. As regras permitem criar apenas o próprio perfil pendente, com campos limitados e login correspondente ao Firebase Auth. Usuários pendentes não listam terceiros nem acessam compras, e não podem alterar o próprio perfil ou aprovação. A aprovação só pode ser feita por outro escritório aprovado, com autor/data registrados.

No cadastro direto pelo escritório, informar nome, usuário e perfil. O usuário é sugerido pelo nome e pode ser ajustado para evitar homônimos; não muda o login das contas existentes. Pesadores exigem um originador já aprovado e sem troca de senha pendente. A conta é criada aprovada e vinculada, com senha aleatória individual. Ao criar um novo originador, ele precisa trocar sua senha temporária antes de receber novos pesadores por este formulário.

A senha temporária é mostrada ao escritório após a operação para entrega à pessoa. Ela é removida da tela ao fechar o aviso, navegar ou sair, e não é salva no Firestore, auditoria ou localStorage. Se fechar antes de copiar, usar **Redefinir senha** para emitir outra; não é possível consultar a senha atual. Não há envio automático por e-mail ou mensagem.

No primeiro acesso, o usuário é direcionado para **Defina sua nova senha** e informa a senha temporária atual, uma senha nova de 8 a 128 caracteres e a confirmação. Depois entra novamente com a senha nova. A troca obrigatória também vale para acesso direto às páginas; Firestore e Storage bloqueiam o uso operacional enquanto estiver pendente. O próprio cliente não pode remover essa exigência.

**Redefinir senha** mantém o UID, o cadastro, o originador responsável e os documentos de compras. A senha anterior para de funcionar, as sessões anteriores são revogadas e a troca obrigatória volta a ser exigida. Outra conta de escritório pode redefinir a senha de um escritório; o sistema impede redefinir a própria senha por esse botão para evitar bloquear a sessão que receberia a senha temporária. Não apagar e recriar a conta. Contas antigas sem os novos campos continuam entrando normalmente até uma redefinição.

## Implementação e implantação

O navegador chama `criarConta`, `redefinirSenha` e `trocarSenhaInicial`, funções autenticadas em `southamerica-east1`. Criação e redefinição verificam o escritório aprovado no servidor e rejeitam tokens revogados. A troca exige a senha temporária atual, validada no Firebase Auth, para impedir o reaproveitamento de uma sessão anterior. As regras também verificam o horário do login contra `sessaoRevogadaEm`, incluindo depois de liberar a nova senha. A conclusão aguarda a mudança do segundo antes de responder, devido à precisão de `auth_time`.

As operações de senha usam uma trava por UID com expiração para impedir redefinição e troca simultâneas. A criação começa com Auth desabilitado até gravar o perfil; falhas tentam remover somente a conta nova. Na redefinição, o bloqueio operacional ocorre antes da atualização da senha. Se houver falha parcial entre Auth e Firestore, a conta pode continuar aguardando troca; o escritório pode emitir outra senha. Nenhuma compra é apagada ou reatribuída.

Eventos de criação, redefinição e troca ficam em `auditoriaContas`, sem senhas. Clientes não podem escrever nessa coleção. `operacoesContas` é reservada ao servidor. As credenciais administrativas são as do ambiente Cloud Functions; não existe chave de serviço no código do navegador.

**Aprovar o PR e atualizar o GitHub Pages não publica as funções.** É necessário fazer a publicação no projeto Firebase, com uma conta autorizada. Conferir no console o plano e os requisitos de faturamento para Cloud Functions; não houve alteração de plano ou faturamento durante o desenvolvimento.

1. Fazer backup dos dados e regras atuais. Para esta atualização de autocadastro, publicar as novas regras Firestore e os arquivos do app. As funções administrativas não mudaram; se já estiverem publicadas, não precisam de nova publicação:

   ```sh
   npx firebase-tools deploy --only firestore:rules --project gvq-sistema-compras
   ```

   O autocadastro e a aprovação usam Firebase Auth e Firestore, sem depender de Cloud Functions. Cadastro direto e redefinição de senha mantêm a dependência das funções administrativas. Se elas ainda não estiverem instaladas, seguir os passos abaixo.
2. Com Node 22 e Java disponíveis, instalar dependências:

   ```sh
   npm ci
   npm ci --prefix functions
   ```

3. Autenticar no Firebase CLI e publicar as funções e as duas regras na mesma atualização:

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only functions:criarConta,functions:redefinirSenha,functions:trocarSenhaInicial,firestore:rules,storage --project gvq-sistema-compras
   ```

   `AUTH_WEB_API_KEY` é a chave pública de autenticação do projeto, com o valor padrão igual ao app atual. Confirmar o valor solicitado pelo CLI e as restrições dessa chave para a validação de senha no servidor. Não usar chave privada de conta de serviço nesse parâmetro. Depois de uma troca de projeto/chave, atualizar a configuração correspondente. O Storage precisa continuar configurado para os anexos.

4. Publicar os arquivos do app pelo fluxo habitual do GitHub Pages. Se as funções ainda não estiverem publicadas, os botões de contas mostram serviço indisponível e não simulam sucesso.
5. Testar o autocadastro de cada perfil: tentar entrar antes da aprovação (deve bloquear), aprovar pelo escritório e entrar novamente. Para pesador, conferir o vínculo obrigatório. Testar também com uma conta de teste criada pelo escritório: criar pesador vinculado → entrar → trocar senha → entrar novamente → registrar compra → redefinir senha → confirmar que o histórico continua disponível.

## Busca e ordenação

- Escritório: busca geral por pecuarista/local/raça além dos filtros de código, fazenda, originador, etapa e mês; busca em pecuaristas por nome/documento/local e em destinos por nome/local.
- Usuários: nome, login ou originador, com filtros de perfil e situação (incluindo troca de senha pendente).
- Originador: pendências por texto, mês e primeira validação/revalidação; histórico por texto, dia/mês e situação.
- Pesador: histórico por texto, dia/mês e situação.
- Busca sem distinção de acentos/maiúsculas; cada termo precisa corresponder ao registro. Listas de nomes, bancos, cidades, estados, opções de autocomplete e raças em ordem alfabética pt-BR. Placeholder permanece no início e Outra no final. Compras mantêm as mais recentes primeiro.

Os filtros operam sobre os dados já carregados pelas consultas existentes; esta versão não introduz paginação no servidor.

## Verificação local

```sh
npm test
npm run test:rules
npm run test:storage
npm run test:contas
npm run test:browser
```

O projeto de testes é `demo-gvq-tests`. Os testes de contas executam os handlers com Admin SDK, Firebase Auth e Firestore emulados, verificando senhas de verdade no Auth do emulador. O transporte HTTP das callable functions e a implantação em produção não foram exercitados neste ambiente. O teste de navegador simula Firebase, Functions, Storage e IBGE e cobre telas, redirecionamentos, buscas, tratamento de falhas e estilos em desktop/celular.
