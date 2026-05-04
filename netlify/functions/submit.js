const KNOWN_GROUPS = [
  'k3s-admins',
  'k3s-dev-airflow',
  'k3s-dev-airflow-dev',
  'k3s-dev-cv-generator',
  'k3s-dev-dss-to-spark',
  'k3s-dev-finops',
  'k3s-dev-jenius',
  'k3s-dev-le-coffre',
  'k3s-dev-openproject',
  'k3s-dev-outline',
  'k3s-dev-qdrant',
  'k3s-dev-som-portal',
  'k3s-dev-som-recover',
  'k3s-dev-superset',
  'k3s-dev-website',
];

const VALID_KEY_TYPES = ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { email, pubkey, group } = body;

  if (!email || !pubkey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email et clé SSH requis' }) };
  }

  if (!/^[a-zA-Z0-9._%+-]+@soma-smart\.com$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email invalide — format attendu : prenom.nom@soma-smart.com' }) };
  }

  const keyType = pubkey.trim().split(' ')[0];
  if (!VALID_KEY_TYPES.includes(keyType)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Type de clé SSH non reconnu : ${keyType}` }) };
  }

  if (group && !KNOWN_GROUPS.includes(group)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Groupe Entra ID inconnu : ${group}` }) };
  }

  const issueBody = [
    "## Demande d'onboarding",
    '',
    `**Email:** ${email}`,
    `**Groupe Entra ID:** ${group || 'Aucun (SSH uniquement)'}`,
    '',
    '**Clé publique SSH:**',
    '```',
    pubkey.trim(),
    '```',
    '',
    '---',
    "*Soumis via le portail d'onboarding — ajouter le label `approved` pour déclencher l'onboarding automatique.*",
  ].join('\n');

  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_PAT}`,
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

  if (!response.ok) {
    const err = await response.text();
    console.error('GitHub API error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Impossible de créer la demande — contacter un administrateur' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Demande créée avec succès' }),
  };
};
