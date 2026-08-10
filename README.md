# Acará Poker Club Helper — versão com backend seguro

Esta versão remove a chave da Anthropic do navegador/APK. A análise por foto agora segue:

**App/PWA → Cloudflare Worker → Anthropic API → Worker → App**

A chave `ANTHROPIC_API_KEY` fica somente no Cloudflare Worker.

## Arquivos

- `index.html` — app atualizado.
- `manifest.json` — manifesto PWA.
- `sw.js` — service worker (cache v2).
- `icon-*.png` — ícones existentes.
- `worker.js` — backend Cloudflare Worker.
- `wrangler.jsonc` — configuração opcional para deploy por Wrangler.

## 1. Publique o Worker no Cloudflare

No painel Cloudflare:

1. Entre em **Workers & Pages**.
2. Crie um Worker, por exemplo `acara-poker-api`.
3. Abra o editor de código do Worker.
4. Substitua o código pelo conteúdo de `worker.js` e faça o deploy.
5. Abra **Settings → Variables and Secrets**.
6. Adicione `ANTHROPIC_API_KEY` como **Secret** e informe sua chave Anthropic.
7. Adicione `ALLOWED_ORIGINS` como variável de texto com a origem do seu site.
   Exemplo: `https://SEU-USUARIO.github.io`
8. Opcional: `ANTHROPIC_MODEL=claude-sonnet-5`.

Não coloque a chave no `index.html`, GitHub ou APK.

## 2. Descubra a URL do Worker

Ela será parecida com:

`https://acara-poker-api.SEUSUBDOMINIO.workers.dev`

Teste no navegador:

`https://acara-poker-api.SEUSUBDOMINIO.workers.dev/health`

Deve retornar JSON com `"ok": true` e `"configured": true`.

## 3. Atualize o app no GitHub Pages

Envie/substitua no mesmo repositório:

- `index.html`
- `manifest.json`
- `sw.js`
- `icon-96.png`
- `icon-192.png`
- `icon-512.png`
- `icon-512-maskable.png`

Espere o GitHub Pages atualizar.

## 4. Configure o servidor dentro do app

1. Abra o app/site.
2. Toque em **⚙️**.
3. Cole a URL do Worker, sem `/analyze` no final.
4. Toque em **Salvar servidor**.
5. Volte para **Analisar mesa**, escolha/tire uma foto e toque em analisar.

A URL fica salva no aparelho. A chave da Anthropic não fica no aparelho.

## 5. Gere o APK novamente

Depois de confirmar que a análise funciona no link do GitHub Pages:

1. Faça o scan da URL no PWABuilder.
2. Gere novamente o pacote Android/APK.
3. Instale o novo APK.
4. Abra ⚙️ no app e informe a mesma URL do Worker.

## Erros mais comuns

- **Origem não autorizada**: `ALLOWED_ORIGINS` não corresponde ao domínio do GitHub Pages.
- **ANTHROPIC_API_KEY não foi configurada**: secret ausente no Worker.
- **Anthropic respondeu HTTP 401**: chave inválida.
- **Anthropic respondeu HTTP 402/403**: verifique billing/permissões da conta Anthropic.
- **Imagem muito grande**: o app já reduz fotos para até 2000 px no lado maior; tente outra imagem se necessário.
- **Resposta inválida do servidor**: confira se a URL em ⚙️ aponta para o Worker correto.

## Segurança

O frontend não contém mais `x-api-key`, chave Anthropic ou a flag de acesso direto pelo navegador. O Worker restringe CORS por `ALLOWED_ORIGINS` e a resposta da API não é armazenada em cache.
