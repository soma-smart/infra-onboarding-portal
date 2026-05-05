# Cloudflare Worker Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le PAT GitHub injecté dans le HTML par un Cloudflare Worker proxy qui détient le PAT côté serveur.

**Architecture:** Le navigateur envoie les données du formulaire (email, pubkey, group) au Worker via POST. Le Worker valide l'origin CORS, valide les champs, puis appelle l'API GitHub Issues avec le PAT stocké comme secret Cloudflare chiffré. Le HTML ne contient plus aucun token.

**Tech Stack:** Cloudflare Workers (ES modules), Wrangler v3, Vitest v2

---

## File Map

| Fichier | Action | Rôle |
|---------|--------|------|
| `worker/package.json` | Créer | Dépendances Wrangler + Vitest |
| `worker/wrangler.toml` | Créer | Config du Worker Cloudflare |
| `worker/index.js` | Créer | Logique du Worker (proxy GitHub) |
| `worker/index.test.js` | Créer | Tests unitaires vitest |
| `.github/workflows/deploy-worker.yml` | Créer | CI/CD du Worker |
| `index.html` | Modifier | Pointer vers le Worker au lieu de `api.github.com` |
| `.github/workflows/deploy-pages.yml` | Modifier | Supprimer l'injection de PAT |

---

### Task 1 : Scaffold du répertoire `worker/`

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.toml`

- [ ] **Créer `worker/package.json`**

```json
{
  "name": "onboarding-proxy",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.101.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Créer `worker/wrangler.toml`**

```toml
name = "onboarding-proxy"
main = "index.js"
compatibility_date = "2024-11-01"
```

- [ ] **Installer les dépendances**

```bash
cd worker && npm install
```

Résultat attendu : `node_modules/` créé, `package-lock.json` généré.

- [ ] **Créer `worker/.gitignore`**

```
node_modules/
.wrangler/
```

- [ ] **Commit**

```bash
git add worker/
git commit -m "feat(worker): scaffold Cloudflare Worker directory"
```

---

### Task 2 : Tests unitaires (TDD — écrire les tests avant le code)

**Files:**
- Create: `worker/index.test.js`

- [ ] **Créer `worker/index.test.js`**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index.js';

const ALLOWED_ORIGIN = 'https://onboarding.soma-smart.cloud';
const mockEnv = { ISSUES_PAT: 'test-pat-123' };

function makeRequest(body, origin = ALLOWED_ORIGIN) {
  return new Request('https://worker.example.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

describe('onboarding-proxy worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('répond aux preflight OPTIONS avec les headers CORS', async () => {
    const req = new Request('https://worker.example.com/', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejette les méthodes non-POST avec 405', async () => {
    const req = new Request('https://worker.example.com/', {
      method: 'GET',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(405);
  });

  it('rejette les origins non autorisées avec 403', async () => {
    const req = makeRequest(
      { email: 'a@soma-smart.com', pubkey: 'ssh-ed25519 AAAA test' },
      'https://evil.com'
    );
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(403);
  });

  it('rejette un body sans email avec 400', async () => {
    const req = makeRequest({ pubkey: 'ssh-ed25519 AAAA test' });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it('rejette un body sans pubkey avec 400', async () => {
    const req = makeRequest({ email: 'a@soma-smart.com' });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/pubkey/i);
  });

  it('crée une issue GitHub et retourne {ok: true} sur requête valide', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ number: 42 }), { status: 201 })
      )
    );
    const req = makeRequest({
      email: 'jdupont@soma-smart.com',
      pubkey: 'ssh-ed25519 AAAA jdupont',
      group: 'k3s-dev-airflow-dev',
    });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/soma-smart/infra-onboarding-portal/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-pat-123',
        }),
      })
    );
  });

  it("retourne 502 quand l'API GitHub échoue", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
      )
    );
    const req = makeRequest({ email: 'a@soma-smart.com', pubkey: 'ssh-ed25519 AAAA test' });
    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('Bad credentials');
  });
});
```

- [ ] **Vérifier que les tests échouent (worker non encore créé)**

```bash
cd worker && npm test
```

Résultat attendu : erreur `Cannot find module './index.js'`

- [ ] **Commit**

```bash
git add worker/index.test.js
git commit -m "test(worker): add unit tests for onboarding proxy"
```

---

### Task 3 : Implémenter le Worker

**Files:**
- Create: `worker/index.js`

- [ ] **Créer `worker/index.js`**

```javascript
const ALLOWED_ORIGIN = 'https://onboarding.soma-smart.cloud';
const GITHUB_API = 'https://api.github.com/repos/soma-smart/infra-onboarding-portal/issues';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders(),
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    if (origin !== ALLOWED_ORIGIN) {
      return json({ error: 'Forbidden' }, 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON invalide' }, 400, origin);
    }

    const { email, pubkey, group } = body ?? {};

    if (!email) return json({ error: 'email est requis' }, 400, origin);
    if (!pubkey) return json({ error: 'pubkey est requis' }, 400, origin);

    const groupLabel = group || 'Aucun (SSH uniquement)';
    const issueBody = [
      "## Demande d'onboarding",
      '',
      `**Email:** ${email}`,
      `**Groupe Entra ID:** ${groupLabel}`,
      '',
      '**Clé publique SSH:**',
      '```',
      pubkey,
      '```',
      '',
      '---',
      "*Soumis via le portail d'onboarding — ajouter le label `approved` pour déclencher l'onboarding automatique.*",
    ].join('\n');

    const ghRes = await fetch(GITHUB_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ISSUES_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Onboarding : ${email}`,
        body: issueBody,
        labels: ['onboarding', 'pending'],
      }),
    });

    if (!ghRes.ok) {
      const data = await ghRes.json();
      return json({ error: data.message || 'Erreur GitHub' }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(origin === ALLOWED_ORIGIN ? corsHeaders() : {}),
    },
  });
}
```

- [ ] **Lancer les tests — ils doivent tous passer**

```bash
cd worker && npm test
```

Résultat attendu :
```
✓ répond aux preflight OPTIONS avec les headers CORS
✓ rejette les méthodes non-POST avec 405
✓ rejette les origins non autorisées avec 403
✓ rejette un body sans email avec 400
✓ rejette un body sans pubkey avec 400
✓ crée une issue GitHub et retourne {ok: true} sur requête valide
✓ retourne 502 quand l'API GitHub échoue
Test Files  1 passed (1)
Tests  7 passed (7)
```

- [ ] **Commit**

```bash
git add worker/index.js
git commit -m "feat(worker): implement onboarding proxy Cloudflare Worker"
```

---

### Task 4 : Workflow de déploiement du Worker

**Files:**
- Create: `.github/workflows/deploy-worker.yml`

- [ ] **Créer `.github/workflows/deploy-worker.yml`**

```yaml
name: Deploy Cloudflare Worker

on:
  push:
    branches: [main]
    paths:
      - 'worker/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        working-directory: worker
        run: npm ci

      - name: Run tests
        working-directory: worker
        run: npm test

      - name: Deploy Worker
        working-directory: worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: npm run deploy

      - name: Upload ISSUES_PAT secret to Worker
        working-directory: worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          ISSUES_PAT: ${{ secrets.ISSUES_PAT }}
        run: echo "$ISSUES_PAT" | npx wrangler secret put ISSUES_PAT
```

- [ ] **Commit et push**

```bash
git add .github/workflows/deploy-worker.yml
git commit -m "feat(workflow): add Cloudflare Worker deploy workflow"
git push
```

- [ ] **Vérifier que le workflow se déclenche et relever l'URL du Worker dans les logs**

Aller sur GitHub → Actions → "Deploy Cloudflare Worker". Dans la step "Deploy Worker", chercher la ligne :
```
Published onboarding-proxy (WORKER_URL)
  https://onboarding-proxy.<subdomain>.workers.dev
```

Noter cette URL — elle est nécessaire pour la Task 5.

---

### Task 5 : Mettre à jour `index.html`

**Files:**
- Modify: `index.html` (ligne ~171–184)

> Prérequis : avoir l'URL du Worker depuis les logs de la Task 4.

- [ ] **Remplacer le bloc `fetch` dans `index.html`**

Remplacer les lignes 171–184 (le bloc `fetch` vers `api.github.com`) par :

```javascript
        const res = await fetch('https://onboarding-proxy.<subdomain>.workers.dev', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pubkey, group }),
        });
```

Remplacer `<subdomain>` par la valeur relevée dans les logs de la Task 4.

- [ ] **Vérifier qu'il ne reste aucune référence à `__GITHUB_PAT__` ou `api.github.com`**

```bash
grep -n "PAT\|api.github.com\|Authorization" index.html
```

Résultat attendu : aucune ligne.

- [ ] **Commit**

```bash
git add index.html
git commit -m "feat(frontend): call Cloudflare Worker instead of GitHub API directly"
```

---

### Task 6 : Nettoyer `deploy-pages.yml`

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`

- [ ] **Supprimer l'étape d'injection du PAT dans `deploy-pages.yml`**

Retirer le bloc suivant (environ lignes 27–28) :

```yaml
      - name: Inject PAT into index.html
        run: sed -i "s/__GITHUB_PAT__/${{ secrets.ISSUES_PAT }}/g" index.html
```

- [ ] **Commit et push**

```bash
git add .github/workflows/deploy-pages.yml index.html
git commit -m "chore: remove PAT injection from deploy-pages workflow"
git push
```

- [ ] **Vérifier le déploiement GitHub Pages**

Attendre que le workflow `Deploy to GitHub Pages` passe. Ouvrir `https://onboarding.soma-smart.cloud` en navigation privée et inspecter la source : aucun token ne doit apparaître.

- [ ] **Test fonctionnel end-to-end**

Soumettre une vraie demande via le formulaire. Vérifier qu'une issue est créée dans `soma-smart/infra-onboarding-portal` avec les bons labels `onboarding` et `pending`.
