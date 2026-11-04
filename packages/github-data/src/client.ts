/** Sends one GraphQL operation and resolves with its `data`. */
export type GraphQLClient = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export interface ClientOptions {
  token: string;
  endpoint?: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Extra attempts after a network error or a 502/503/504 response. Default 2. */
  retries?: number;
  /** Delay before the first retry, doubled for each further retry. Default 500 ms. */
  retryDelayMs?: number;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Node's fetch hides the real reason (DNS, reset, timeout) in `error.cause`. */
function networkErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as (Error & { code?: string }) | undefined;
  const detail = cause?.code ?? cause?.message;
  return detail ? `${error.message} (${detail})` : error.message;
}

export function createGraphQLClient(options: ClientOptions): GraphQLClient {
  const endpoint = options.endpoint ?? 'https://api.github.com/graphql';
  const doFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 500;

  return async (query, variables) => {
    const body = JSON.stringify({ query, variables });
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(retryDelayMs * 2 ** (attempt - 1));

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'starforge',
          },
          body,
        });
      } catch (error) {
        lastError = new Error(`Could not reach GitHub: ${networkErrorDetail(error)}`);
        continue;
      }

      const failure = `GitHub GraphQL request failed: ${response.status} ${response.statusText}`;
      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        lastError = new Error(failure);
        continue;
      }
      if (!response.ok) throw new Error(failure);

      const payload = (await response.json()) as {
        data?: unknown;
        errors?: { message: string }[];
      };
      if (payload.errors?.length) {
        throw new Error(
          `GitHub GraphQL errors: ${payload.errors.map((e) => e.message).join('; ')}`,
        );
      }
      return payload.data;
    }

    throw lastError ?? new Error('GitHub GraphQL request failed');
  };
}
