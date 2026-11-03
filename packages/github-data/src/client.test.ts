import { describe, expect, it } from 'vitest';
import { createGraphQLClient } from './client';

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('createGraphQLClient', () => {
  it('returns data and sends the bearer token', async () => {
    let authorization: string | null = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      authorization = new Headers(init.headers).get('authorization');
      return new Response(JSON.stringify({ data: { ok: true } }));
    }) as unknown as typeof fetch;

    const client = createGraphQLClient({ token: 'tok', fetch: fakeFetch });
    await expect(client('query { viewer { login } }', {})).resolves.toEqual({ ok: true });
    expect(authorization).toBe('Bearer tok');
  });

  it('throws on GraphQL errors', async () => {
    const client = createGraphQLClient({
      token: 'tok',
      fetch: jsonFetch({ errors: [{ message: 'boom' }] }),
    });
    await expect(client('query {}', {})).rejects.toThrow(/boom/);
  });

  it('throws on HTTP failures', async () => {
    const client = createGraphQLClient({ token: 'tok', fetch: jsonFetch({}, 401) });
    await expect(client('query {}', {})).rejects.toThrow(/401/);
  });
});
