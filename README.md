# gvq-sistema-integrado
Sistema unificado de Romaneio e Compras - GVQ

## Estrutura

```
index.html              Login e cadastro (fica na raiz: é a entrada do site)
pages/
  painel.html           Painel do Originador (lançamento de romaneios)
  escritorio.html       Painel do Escritório (histórico, pecuaristas, destinos)
css/
  base.css              Design system: cores, tipografia, botões, formulários, cards, tabelas e o layout dos painéis
  login.css             Estilos do index.html
  painel.css            Estilos do painel do originador
  escritorio.css        Estilos do painel do escritório
js/
  firebase.js           Configuração e inicialização única do Firebase (app, auth, db)
  login.js              Lógica do index.html
  painel.js             Lógica do painel do originador
  escritorio.js         Lógica do painel do escritório
assets/img/
  logo-gvq.png          Logo para fundo claro
  logo-gvq-negativo.png Logo para fundo escuro (barra lateral, painel da marca)
  simbolo-gvq.png       Só o selo verde
  favicon.png           Ícone da aba
  icones.svg            Biblioteca de ícones (sprite SVG)
scripts/
  dev-server.mjs        Servidor de desenvolvimento com recarga automática
docs/
  DILIGENCIA.md         Diagnóstico do código e plano de melhorias por etapas
```

Cada página carrega `css/base.css` + o seu CSS, e um único módulo JS que importa `js/firebase.js`.

## Identidade visual

| | Cor | Uso |
|---|---|---|
| Índigo GVQ | `#12004F` | Cor estrutural: barra lateral, títulos, painel da marca |
| Verde GVQ | `#00A651` | Destaques, item ativo, foco |
| Verde ação | `#00843F` | Botões primários (contraste AA com texto branco) |

Tipografia: **Montserrat** nos títulos (a mesma família do logo) e **Inter** no texto. Os tokens ficam no topo de `css/base.css`; use as variáveis semânticas (`--cor-*`) nas páginas.

Ícones: `<svg class="icon"><use href="assets/img/icones.svg#romaneio"></use></svg>` (em `pages/`, use `../assets/...`).

## Rodando localmente

Os scripts são módulos ES (`type="module"`), que o navegador **não** carrega abrindo o arquivo direto (`file://`). Use o servidor de desenvolvimento (precisa só do Node):

```bash
node scripts/dev-server.mjs
```

e abra http://localhost:5500. A página recarrega sozinha quando um arquivo é salvo, e mudanças de CSS são aplicadas sem nem recarregar.

> ⚠️ A configuração em `js/firebase.js` aponta para o projeto Firebase de **produção** (`gvq-sistema-compras`). Tudo o que for feito localmente grava nos dados reais. Ver Etapa 1 em [docs/DILIGENCIA.md](docs/DILIGENCIA.md).

## Perfis e encaminhamento

O escritório aprova o pesador e define seu originador responsável. O fluxo começa no **pesador**, passa pela conferência e negociação do **originador** e termina no **escritório**. Instruções de implantação das regras, vínculo do histórico e testes: [docs/FLUXO-PESADOR.md](docs/FLUXO-PESADOR.md).

