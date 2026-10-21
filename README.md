# GVQ — Sistema Integrado

Sistema interno de pesagem, negociação e acompanhamento de compras de gado.

## Fluxo de trabalho

1. **Pesador:** registra a pesagem e os dados da compra, sem acesso aos valores da negociação.
2. **Originador:** confere as informações, informa valores e comissão e envia ao escritório.
3. **Escritório:** acompanha as etapas Recebida, Em andamento e Finalizada, administra cadastros e exporta dados.

As contas são criadas pelo escritório, com senha temporária e troca obrigatória no primeiro acesso. O sistema também possui filtros, código da compra e anexos opcionais, com revalidação após novos documentos.

Para a apresentação ao T.I., os anexos estão em **modo de demonstração**: somente os nomes e as categorias são salvos como texto. Os arquivos não são enviados e não ficam disponíveis para download. É possível selecionar vários documentos e demonstrar a complementação e a revalidação. O controle está em `js/configuracao.js`; o armazenamento definitivo será definido com o T.I.

## Tecnologia e implantação

HTML, CSS e JavaScript, com Firebase Authentication, Firestore, Storage e Cloud Functions. A hospedagem definitiva e o banco serão definidos com o T.I.; o uso da Cloudflare está em avaliação.

Antes do uso real, confirmar as regras de acesso publicadas, o armazenamento dos anexos e a implantação das funções de contas e senhas, além de separar testes de produção e configurar backup.

## Executar localmente

Com Node.js instalado:

```sh
node scripts/dev-server.mjs
```

Acesse http://localhost:5500. A configuração em `js/firebase.js` conecta ao projeto `gvq-sistema-compras`: o uso local também grava nesse banco. Os dados atuais são fictícios e podem ser descartados na implantação, conforme definido pelo responsável.

## Documentação técnica

- [Fluxo dos perfis e regras](docs/FLUXO-PESADOR.md)
- [Contas, senhas, implantação e testes](docs/CONTAS-ADMIN.md)

