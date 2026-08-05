# Wildwood SpacetimeDB

## Local development

Run SpacetimeDB and the static site in separate terminals:

```sh
spacetime start
spacetime publish wildwood-coop --module-path spacetimedb --server local
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/index.html`.

Local databases do not appear in the SpacetimeDB account dashboard.

## Maincloud

Authenticate once, then publish:

```sh
spacetime login
npm run spacetime:publish:cloud
npm run build:coop
```

Deployed Wildwood pages automatically use `wss://maincloud.spacetimedb.com`; localhost pages use `ws://localhost:3000`.

Do not use `--delete-data=always` outside local development. It destroys the selected database contents.

## SpacetimeAuth

Wildwood uses SpacetimeAuth Magic Link with public client ID `client_03426HMgkAEmdC23XTZRKZ`.

Configure this exact redirect URI in the SpacetimeAuth project:

```text
https://tydoskus.github.io/wildwood/
```

The browser uses Authorization Code + PKCE. No client secret belongs in this repository. A player may play as a guest, then sign in once to migrate their existing name and progress to their authenticated account. Account migration links are private, random, and expire after 10 minutes.
