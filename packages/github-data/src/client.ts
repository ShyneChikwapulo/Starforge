/** Sends one GraphQL operation and resolves with its `data`. */
export type GraphQLClient = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export interface ClientOptions {
  token: string;
  endpoint?: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

export function createGraphQLClient(options: ClientOptions): GraphQLClient {
  const endpoint = options.endpoint ?? 'https://api.github.com/graphql';
  const doFetch = options.fetch ?? fetch;

  return async (query, variables) => {
    const response = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'starforge',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      data?: unknown;
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      throw new Error(`GitHub GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    return body.data;
  };
}
