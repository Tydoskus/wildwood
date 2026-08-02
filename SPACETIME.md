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
