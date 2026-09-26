# Way Última Milha — site 2026

Site institucional estático com experiência WebGL contínua. **Não tem build
step**: o que está no repositório é exatamente o que vai para o servidor.

## Tecnologias

| Camada | Tecnologia | Versão | Uso |
|---|---|---|---|
| Estrutura | HTML5 | — | Marcação semântica, sem template engine |
| Estilo | CSS3 (design system próprio) | — | `assets/css/way.css` — sem framework CSS (Tailwind, Bootstrap etc.) |
| Comportamento | JavaScript (ES Modules) | — | Vanilla JS puro, sem framework (React/Vue/Svelte) e sem bundler |
| 3D / WebGL | [Three.js](https://threejs.org/) | r160 | Motor de toda a experiência 3D (rotas, selo, carga, mapa, sinal, fechamento) |
| 3D / WebGL | Addons de post-processing do Three.js | r160 | `EffectComposer`, bloom (`UnrealBloomPass` — desligado no tema claro atual) |
| Scroll | [Lenis](https://lenis.darkroom.engineering/) | 1.1.14 | Scroll suave sincronizado com a câmera 3D |
| Tipografia | Google Fonts | — | Sora, Inter, JetBrains Mono (via `<link>`, sem self-host) |
| Formulários | [StaticForms](https://www.staticforms.xyz/) | — | Backend de envio (orçamento e cadastro de agregado), sem servidor próprio |
| Build | Nenhum | — | Sem npm/webpack/vite — os arquivos são servidos exatamente como estão no repositório |
| Hospedagem | [Netlify](https://www.netlify.com/) | — | Servidor de produção atual (confirmado via cabeçalho `server: Netlify`) |
| Hospedagem (config alternativa) | Apache (`.htaccess`) | — | Redirects/cache/segurança equivalentes, caso o site mude de hospedagem |

Todas as libs de terceiros (Three.js, addons, Lenis) estão **vendorizadas
localmente** em `assets/js/vendor/` — nenhuma vem de CDN, então o site não
depende de rede externa disponível para funcionar (só as fontes do Google e o
StaticForms, que são serviços externos por natureza).

## Ver localmente

**Abrir o `index.html` com duplo clique não funciona.** Em `file://` a origem é
`null`, e módulos ES + import maps são barrados por CORS — o `main.js` nunca
executa. Suba um servidor HTTP na pasta:

```bash
cd waysite
python3 -m http.server 8080     # ou: npx serve .
```

Depois acesse `http://localhost:8080`.

Sem servidor a página **não fica quebrada** — o preloader se remove sozinho em
6 segundos e o conteúdo aparece inteiro, com o poster estático no lugar do
canvas. Só a experiência 3D não roda. É o mesmo caminho de degradação de um
visitante com JavaScript bloqueado.

## Deploy

Copiar o conteúdo desta pasta para a raiz pública do domínio — via Git (deploy
automático) ou upload manual, dependendo de como a hospedagem estiver
configurada. Dois arquivos cuidam de redirects/cache/segurança, um para cada
tipo de servidor:

- **`netlify.toml`** — hospedagem atual do domínio (confirmado via cabeçalho
  `server: Netlify`). Lido automaticamente pela Netlify a cada deploy, sem
  configuração manual pelo painel.
- **`.htaccess`** — equivalente para Apache, caso o site mude de hospedagem no
  futuro.

Os dois cuidam de:

- **301 das URLs antigas** → `Sobre.html`, `servicos.html`, `localização.html` e
  `/trabalhecomagente` apontam para os destinos novos, preservando o SEO já
  acumulado.
- Cabeçalhos de segurança (`nosniff`, `Referrer-Policy`, cache de assets, etc).

Se o servidor não for Netlify nem Apache, replicar os redirects na
configuração equivalente — é a única parte que não é portável.

> **Cache**: os assets são servidos com `immutable` por um ano. Ao alterar CSS ou
> JS, renomear o arquivo ou adicionar `?v=2` nas tags do HTML, senão o
> navegador do visitante continua com a versão antiga.

## Estrutura

```
index.html                     landing completa (7 seções em scroll)
contato.html                   formulário de orçamento
trabalhe-com-a-gente.html      cadastro de agregado
obrigado.html                  confirmação (caminho sem JS)
404.html
robots.txt  sitemap.xml  .htaccess

assets/css/way.css             design system inteiro (tokens + layout)
assets/data/sp-rings.js        contorno do estado de SP — malha oficial do IBGE
assets/data/regioes.js         polos, linhas e coordenadas reais
assets/js/main.js              orquestração
assets/js/gl/                  camada WebGL
  core.js                      renderer, câmera, bloom, tiers de qualidade
  shaders.js                   todo o GLSL
  world.js                     trilho de câmera ligado ao scroll
  ambient.js                   poeira sempre ativa
  hero.js                      capítulo — malha de rotas (#hero)
  creds.js                     capítulo — selo de licença (#credenciais)
  cargo.js                     capítulo — volumes de carga (#servicos)
  mapa.js                      capítulo — mapa 3D de São Paulo (#regioes)
  tech.js                      capítulo — sinal / rede de dados (#tecnologia)
  finale.js                    capítulo — convergência de encerramento (#fechamento)
assets/js/ui/                  nav, formulários, revelações, ponteiro
assets/js/vendor/              three.js r160 + addons de bloom + lenis
```

## Como a experiência 3D funciona

Um único `<canvas>` fixo atrás de todo o conteúdo, com seis **capítulos** que
compartilham a origem do mundo e trocam por crossfade conforme o scroll: rotas
(`#hero`), selo de licença (`#credenciais`), carga (`#servicos`), mapa de SP
(`#regioes`), rede de sinal (`#tecnologia`) e convergência de encerramento
(`#fechamento`). A seção `#sobre` fica sem capítulo próprio de propósito —
nela a câmera só desliza entre os dois capítulos vizinhos, sem geometria nova
disputando atenção com os três cards de "por que a Way".

Cada capítulo se ancora a uma seção do DOM e declara *shots* de câmera em
progressos locais. `world.js` achata os shots numa linha do tempo ordenada por
posição de scroll e interpola entre eles.

Detalhes que não são óbvios e vão quebrar se mexerem sem cuidado:

- **Os capítulos ficam na mesma origem de propósito.** Espalhá-los pelo espaço e
  voar a câmera entre eles não funciona aqui: as seções são adjacentes, sem
  intervalo de rolagem, então a troca sai como um salto.
- **As janelas de scroll não se sobrepõem** (`start` é travado no `end` da
  anterior). Sem isso os shots de capítulos vizinhos se intercalam na linha do
  tempo e a câmera anda para trás no meio da rolagem.
- **O mapa se ancora sozinho** ao `.map__stage`, frame a frame
  (`SpMap._align`). No mobile essa coluna fica *abaixo* do texto — um offset
  calculado uma vez só deixaria o estado renderizando sobre os parágrafos.
- **Os rótulos dos polos são HTML projetado**, não textura. Barueri e Votorantim
  estão a 0,04° de latitude um do outro, então há de-colisão vertical medida em
  `_projectPins`. Abaixo de 760px de largura os rótulos são escondidos e a
  legenda ao lado carrega a informação.
- **`world.measure()` precisa rodar de novo** quando a altura do documento muda
  (fontes, imagens, quebras de linha). Já está ligado a `resize`, `load`,
  `document.fonts.ready` e um `ResizeObserver` no body.

### Tiers de qualidade

`core.js` decide entre `low` / `mid` / `high` por `hardwareConcurrency`,
`deviceMemory`, tamanho de tela e `(hover: none)`. O tier controla DPR, bloom,
quantidade de partículas e segmentação dos tubos. Bloom fica desligado no tier
`low` — por isso todos os shaders foram calibrados para ler bem **sem** bloom.

Para depurar: definir `window.__WAY_DEBUG = true` antes do carregamento expõe
`window.way = { stage, world, chapters }` no console.

### Degradação

Três camadas, todas verificadas em browser (24/24 asserções):

- **`prefers-reduced-motion: reduce`** → canvas removido, poster estático em
  gradiente no lugar, revelações nascem visíveis.
- **Sem WebGL** ou falha ao criar o contexto → mesmo poster.
- **Sem JavaScript, ou JS que não carrega** (bloqueio de proxy, 404 no bundle,
  navegador sem import maps, abertura por `file://`) → duas redes:
  1. Um script inline no `<head>` adiciona a classe `js` ao `<html>`. **Todo**
     estado inicial escondido — revelações, máscaras de linha, preloader — é
     escopado em `.js` no CSS. Sem essa classe a página nasce inteira.
  2. Um script inline no `<body>` remove o preloader após 6s caso o módulo
     principal não tenha assumido, e derruba o canvas para o poster aparecer.

  O `.gl-fallback` vem **visível por padrão** e o canvas, que é opaco, o cobre
  quando acende. Progressive enhancement de verdade: nada depende de JS para
  revelar conteúdo.

  Os formulários fazem POST nativo com `redirectTo` para `obrigado.html`.

  **Limite honesto:** sem JS o menu mobile (`.nav__burger`) não abre, porque os
  links do topo ficam escondidos abaixo de 860px. A navegação nesse caso é a do
  rodapé, que está sempre visível e completa.

## Formulários

Backend é o **StaticForms**, com a mesma `accessKey` que o site anterior já
usava (`84bb621b-…`) — nada a provisionar. O JS envia por `fetch` e confirma na
própria página; sem JS, o POST nativo redireciona para `obrigado.html`.

Trocar a chave em `contato.html` e `trabalhe-com-a-gente.html` (campo hidden
`accessKey`) se a conta mudar.

## Conteúdo que veio do site anterior

Todo o texto factual foi preservado: as seis autorizações sanitárias (AE
Portaria 344, AFE Medicamentos/Correlatos/Cosméticos, SIVISA, CRF), os três
serviços, a descrição da frota, os quatro polos, a linha diária para Ribeirão
Preto, telefone, e-mail e Instagram.

**Pendências que dependem de informação da empresa:**

1. **Números de desempenho.** As quatro estatísticas na seção de credenciais são
   todas verificáveis a partir do próprio conteúdo da empresa (4 polos, 6
   licenças, 100% das cargas seguradas, 5 regiões). Qualquer KPI de operação —
   pontualidade, SLA, volume mensal, tempo médio de entrega — precisa vir de
   dados reais antes de entrar no site.
2. **Endereço e CNPJ.** Não constavam no site antigo. Adicionar em
   `footer` e no JSON-LD (`address`) melhora bastante o SEO local.
3. **LinkedIn.** O site antigo tinha o ícone com `href=""` (link morto). Foi
   removido em vez de publicar um link quebrado — devolver quando houver URL.
4. **Console de rastreamento** (seção Tecnologia) é uma ilustração, rotulada
   como "exemplo ilustrativo" na própria interface. Trocar por captura real do
   Way Sistema Logístico se preferirem.
5. **Crédito de autoria** do rodapé anterior ("Feito com ♡ por Brendon
   Fernandes") não foi transposto, já que este é um código novo de outra
   autoria. Decisão de vocês se quiserem manter algum crédito.

## Peso

Primeiro carregamento da home: **≈ 231 KB gzip** de HTML + CSS + JS, sendo
162 KB o three.js. Imagens carregam com `loading="lazy"`, exceto o logotipo.

As imagens vieram do site antigo sem reprocessamento. Converter para WebP/AVIF e
redimensionar (`Agregando.jpg` tem 245 KB) derruba os ~630 KB de imagens para
algo em torno de 150 KB — é o ganho de performance mais fácil que sobrou.
