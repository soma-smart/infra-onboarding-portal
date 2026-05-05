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
      groups: ['k3s-dev-airflow-dev', 'k3s-dev-outline'],
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
