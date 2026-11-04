import { describe, expect, it } from 'vitest';
import { createGraphQLClient } from './client';

const networkError = (code: string) =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error(`connect ${code}`), { code }),
  });

function scripted(steps: (Error | Response)[]) {
  let calls = 0;
  const fetchStub = (async () => {
    const step = steps[Math.min(calls++, steps.length - 1)]!;
    if (step instanceof Error) throw step;
    return step;
  }) as unknown as typeof fetch;
  return { fetch: fetchStub, calls: () => calls };
}

const ok = () => new Response(JSON.stringify({ data: { ok: true } }));
const options = { token: 'tok', retryDelayMs: 0 };

describe('createGraphQLClient retries', () => {
  it('retries a network failure and then succeeds', async () => {
    const stub = scripted([networkError('ECONNRESET'), ok()]);
    const client = createGraphQLClient({ ...options, fetch: stub.fetch });
    await expect(client('query {}', {})).resolves.toEqual({ ok: true });
    expect(stub.calls()).toBe(2);
  });

  it('gives up after the retries and names the underlying cause', async () => {
    const stub = scripted([networkError('ENOTFOUND')]);
    const client = createGraphQLClient({ ...options, fetch: stub.fetch });
    await expect(client('query {}', {})).rejects.toThrow(/ENOTFOUND/);
    expect(stub.calls()).toBe(3);
  });

  it('retries a 503 response', async () => {
    const stub = scripted([new Response('', { status: 503 }), ok()]);
    const client = createGraphQLClient({ ...options, fetch: stub.fetch });
    await expect(client('query {}', {})).resolves.toEqual({ ok: true });
    expect(stub.calls()).toBe(2);
  });

  it('does not retry client errors such as 401', async () => {
    const stub = scripted([new Response('', { status: 401 })]);
    const client = createGraphQLClient({ ...options, fetch: stub.fetch });
    await expect(client('query {}', {})).rejects.toThrow(/401/);
    expect(stub.calls()).toBe(1);
  });
});
