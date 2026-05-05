const ALLOWED_ORIGIN = 'https://onboarding.soma-smart.cloud';
const GITHUB_API = 'https://api.github.com/repos/soma-smart/infra-onboarding-portal/issues';

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, type: err.name }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handleRequest(request, env) {
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

    const { email, pubkey, groups = [] } = body ?? {};

    if (!email) return json({ error: 'email est requis' }, 400, origin);
    if (!pubkey) return json({ error: 'pubkey est requis' }, 400, origin);

    const groupsLabel = groups.length > 0 ? groups.join(', ') : 'Aucun (SSH uniquement)';
    const issueBody = [
      "## Demande d'onboarding",
      '',
      `**Email:** ${email}`,
      `**Groupes Entra ID:** ${groupsLabel}`,
      '',
      '**Clé publique SSH:**',
      '```',
      pubkey,
      '```',
      '',
      '---',
      "*Soumis via le portail d'onboarding — ajouter le label `approved` pour déclencher l'onboarding automatique.*",
    ].join('\n');

    let ghRes;
    try {
      ghRes = await fetch(GITHUB_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ISSUES_PAT}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'soma-smart-onboarding-portal',
        },
        body: JSON.stringify({
          title: `Onboarding : ${email}`,
          body: issueBody,
          labels: ['onboarding', 'pending'],
        }),
      });
    } catch (err) {
      return json({ error: `GitHub fetch error: ${err.message}` }, 500, origin);
    }

    if (!ghRes.ok) {
      let errorMsg = `GitHub ${ghRes.status}`;
      try {
        const data = await ghRes.json();
        errorMsg = data.message || errorMsg;
      } catch {
        errorMsg = (await ghRes.text().catch(() => '')) || errorMsg;
      }
      return json({ error: errorMsg }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
}

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
