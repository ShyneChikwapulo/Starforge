export type MetricsSource =
  | { kind: 'sample' }
  | { kind: 'url'; url: string; label: string }
  | { kind: 'error'; message: string };

export interface ViewerParams {
  source: MetricsSource;
  particles: number;
  seed: number;
}

const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;

const validName = (value: string): boolean => NAME.test(value) && !/^\.+$/.test(value);
const failure = (message: string): MetricsSource => ({ kind: 'error', message });

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function resolveSource(query: URLSearchParams): MetricsSource {
  const explicit = query.get('metrics');
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol !== 'https:') return failure('The metrics URL must use https.');
      return { kind: 'url', url: url.toString(), label: url.host };
    } catch {
      return failure('The metrics URL is not valid.');
    }
  }

  let repo = query.get('repo');
  const user = query.get('user');
  if (!repo && user) {
    if (!validName(user)) return failure('That user name is not valid.');
    repo = `${user}/${user}`;
  }

  if (repo) {
    const parts = repo.split('/');
    if (parts.length !== 2 || !parts.every(validName)) {
      return failure('The repository must look like owner/name.');
    }
    const branch = query.get('branch') ?? 'main';
    if (!BRANCH.test(branch) || branch.includes('..'))
      return failure('That branch name is not valid.');
    return {
      kind: 'url',
      url: `https://raw.githubusercontent.com/${repo}/${branch}/starforge/metrics.json`,
      label: repo,
    };
  }

  return { kind: 'sample' };
}

/** Read the viewer's settings from a URL query string, rejecting anything suspicious. */
export function parseViewerParams(search: string): ViewerParams {
  const query = new URLSearchParams(search);
  return {
    source: resolveSource(query),
    particles: clampInt(query.get('particles'), 12000, 1000, 60000),
    seed: clampInt(query.get('seed'), 1, 0, 1_000_000),
  };
}
