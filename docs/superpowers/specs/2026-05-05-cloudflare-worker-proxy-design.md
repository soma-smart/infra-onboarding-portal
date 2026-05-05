# Design : Cloudflare Worker proxy pour le portail d'onboarding

**Date :** 2026-05-05
**Statut :** Approuvé

## Problème

Le PAT GitHub (`ISSUES_PAT`) est actuellement injecté dans `index.html` via `sed` au moment du déploiement. Il est visible dans la source de la page par tout visiteur, ce qui permet à n'importe qui de créer des issues GitHub à volonté au nom du portail.

## Solution

Introduire un Cloudflare Worker comme proxy entre le navigateur et l'API GitHub. Le PAT est stocké comme secret Cloudflare chiffré, jamais exposé au client.

## Architecture

```
Navigateur
  └─ POST /submit (email, pubkey, group)
       ↓
Cloudflare Worker  (onboarding-proxy.soma-smart.workers.dev)
  ├─ Valide CORS (origin: onboarding.soma-smart.cloud)
  ├─ Valide les champs requis
  └─ POST GitHub Issues API  ← ISSUES_PAT (secret Cloudflare)
       ↓
GitHub Issues API
  └─ Crée l'issue avec labels [onboarding, pending]
```

## Composants

### `worker/index.js`

Worker Cloudflare (~50 lignes). Responsabilités :
- Répond aux preflight CORS (`OPTIONS`)
- Valide l'`Origin` de la requête (whitelist : `onboarding.soma-smart.cloud`)
- Parse et valide le body JSON (email, pubkey obligatoires)
- Appelle `POST https://api.github.com/repos/soma-smart/infra-onboarding-portal/issues` avec `env.ISSUES_PAT`
- Retourne `{ok: true}` ou `{error: "message"}` en JSON

### `worker/wrangler.toml`

Configuration Wrangler :
- `name = "onboarding-proxy"`
- `compatibility_date` récente
- `[vars]` : rien (le PAT est un secret, pas une var)

### `.github/workflows/deploy-worker.yml`

Déploie le Worker sur push `main` (après `deploy-pages.yml`). Utilise `wrangler deploy` avec :
- `CLOUDFLARE_API_TOKEN` (secret GitHub → Cloudflare)
- `CLOUDFLARE_ACCOUNT_ID` (secret GitHub)
- Upload du secret `ISSUES_PAT` via `wrangler secret put` en non-interactif

### `index.html` (modification)

Remplacer le `fetch` vers `api.github.com` par un `fetch` vers l'URL du Worker. Supprimer le header `Authorization`. Supprimer `__GITHUB_PAT__`.

### `deploy-pages.yml` (modification)

Supprimer l'étape `Inject PAT into index.html` et la dépendance à `ISSUES_PAT`.

## Secrets requis

| Secret | Où | Usage |
|--------|----|-------|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Déployer le Worker |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Identifier le compte Cloudflare |
| `ISSUES_PAT` | Cloudflare (secret Worker) | Appeler GitHub Issues API |

`ISSUES_PAT` reste dans les secrets GitHub uniquement pour l'upload initial via `wrangler secret put` dans le workflow. Il n'apparaît plus dans le HTML.

## Sécurité

- **CORS strict** : le Worker rejette toute requête dont l'`Origin` n'est pas `https://onboarding.soma-smart.cloud`
- **Validation d'input** : email et pubkey validés avant l'appel GitHub (évite les appels inutiles)
- **Pas de secret dans le code** : le PAT est uniquement dans les secrets Cloudflare chiffrés
- **Surface d'attaque** : le Worker ne fait qu'une seule chose (créer une issue) — pas de lecture, pas d'autres endpoints

## URL du Worker

`https://onboarding-proxy.cd7695ff.workers.dev` (subdomain Cloudflare automatique)

Pas de custom domain nécessaire pour ce cas d'usage.
