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
