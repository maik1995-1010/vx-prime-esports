VX PRIME ESPORTS + GAME BRIDGE
==============================

Questo pacchetto conserva la build VX PRIME V3 e aggiunge:
- Worker principale attivo
- Service Binding GAME_SERVICE -> vx-prime-game
- route /game/ inoltrata al Worker del gioco
- pulsante GIOCA dentro MIO ACCOUNT
- stessa origine browser, quindi stessa sessione Supabase del sito principale

STRUTTURA
---------
public/index.html
public/app.js
public/styles.css
worker-direct.mjs
wrangler.jsonc

DEPLOY CONSIGLIATO DA IPAD
--------------------------
1. Crea su GitHub un repository chiamato vx-prime-esports.
2. Carica NELLA ROOT del repository:
   - worker-direct.mjs
   - wrangler.jsonc
   - la cartella public con index.html, app.js, styles.css
3. Cloudflare -> Workers & Pages -> vx-prime-esports.
4. Collega il repository GitHub al Worker esistente usando Builds / Connect repository.
5. Root directory: /
6. Build command: vuoto
7. Deploy command: npx wrangler deploy
8. Salva e avvia il deploy.
9. Controlla che i bindings mostrino:
   ASSETS
   GAME_SERVICE -> vx-prime-game
10. Testa prima la home e poi /game/.

NON INSERIRE SUPABASE_SECRET_KEY IN QUESTO REPOSITORY.
La secret resta solamente sul Worker vx-prime-game.
