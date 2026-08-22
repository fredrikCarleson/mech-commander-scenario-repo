import { BLOB_STORE_NAME } from '../../../shared/constants.ts';

export type CommunityEnvironmentName = 'development' | 'staging' | 'production';
export type CommunityMutationMode = 'authenticated' | 'disabled';

export const COMMUNITY_ENVIRONMENT_MATRIX = {
  development: {
    apiOrigin: 'http://localhost:8888/api/v1',
    deployContexts: ['dev'],
    blobStore: 'mech-scenarios-development-v1',
    sessionSecretId: 'development-v1',
  },
  staging: {
    apiOrigin: 'https://candidate--meridian-strike-wiki.netlify.app/api/v1',
    deployContexts: ['deploy-preview', 'branch-deploy'],
    blobStore: 'mech-scenarios-candidate-v1',
    sessionSecretId: 'candidate-v1',
  },
  production: {
    apiOrigin: 'https://meridian-strike-wiki.netlify.app/api/v1',
    deployContexts: ['production'],
    blobStore: BLOB_STORE_NAME,
    sessionSecretId: 'production-v1',
  },
} as const;

export interface CommunityEnvironmentConfig {
  name: CommunityEnvironmentName;
  apiOrigin: string;
  blobConsistency: 'strong';
  blobStore: string;
  sessionSecretId: string;
  mutationMode: CommunityMutationMode;
  corsOrigins: Set<string>;
}

function values(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveCommunityEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): CommunityEnvironmentConfig {
  const fallbackDevelopment =
    environment.CONTEXT === 'dev' ||
    environment.NETLIFY_DEV === 'true' ||
    environment.NODE_ENV === 'test';
  const name = (environment.COMMUNITY_ENVIRONMENT ||
    (fallbackDevelopment ? 'development' : '')) as CommunityEnvironmentName;
  if (!['development', 'staging', 'production'].includes(name)) {
    throw new Error(
      'COMMUNITY_ENVIRONMENT must explicitly identify development, staging, or production.',
    );
  }
  const expected = COMMUNITY_ENVIRONMENT_MATRIX[name];
  const apiOrigin =
    environment.COMMUNITY_API_ORIGIN?.trim() || (name === 'development' ? expected.apiOrigin : '');
  if (apiOrigin !== expected.apiOrigin) {
    throw new Error(`API origin does not match the ${name} community environment.`);
  }
  const blobStore =
    environment.SCENARIO_BLOB_STORE?.trim() || (name === 'development' ? expected.blobStore : '');
  if (blobStore !== expected.blobStore) {
    throw new Error(`Blob store does not match the ${name} community environment.`);
  }
  if (name === 'staging' && blobStore === COMMUNITY_ENVIRONMENT_MATRIX.production.blobStore) {
    throw new Error('Candidate community builds cannot use the production Blob store.');
  }
  const sessionSecretId =
    environment.SESSION_SIGNING_SECRET_ID?.trim() ||
    (name === 'development' ? expected.sessionSecretId : '');
  if (sessionSecretId !== expected.sessionSecretId) {
    throw new Error(`Session secret identity does not match the ${name} community environment.`);
  }
  const rawMode =
    environment.COMMUNITY_MUTATION_MODE?.trim() || (name === 'development' ? 'authenticated' : '');
  if (rawMode !== 'authenticated' && rawMode !== 'disabled') {
    throw new Error('COMMUNITY_MUTATION_MODE must explicitly be authenticated or disabled.');
  }
  const defaultDevelopmentOrigins = [
    'http://localhost:5173',
    'http://localhost:8888',
    'http://127.0.0.1:42647',
    'http://127.0.0.1:42648',
  ];
  const corsOrigins = new Set(
    values(environment.COMMUNITY_CORS_ORIGINS).length > 0
      ? values(environment.COMMUNITY_CORS_ORIGINS)
      : name === 'development'
        ? defaultDevelopmentOrigins
        : [],
  );
  if (name !== 'development' && corsOrigins.size === 0) {
    throw new Error(`CORS origins are not configured for the ${name} community environment.`);
  }
  return {
    name,
    apiOrigin,
    blobConsistency: 'strong',
    blobStore,
    sessionSecretId,
    mutationMode: rawMode,
    corsOrigins,
  };
}

export function isCorsOriginAllowed(
  origin: string,
  config = resolveCommunityEnvironment(),
): boolean {
  if (config.corsOrigins.has(origin)) return true;
  if (config.name !== 'staging') return false;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return /^(?:deploy-preview-\d+|[a-z0-9-]+)--meridian-strike-wiki\.netlify\.app$/.test(hostname);
  } catch {
    return false;
  }
}

export function assertMutationEnabled(config = resolveCommunityEnvironment()): void {
  if (config.mutationMode !== 'authenticated') {
    const error = new Error('Community mutations are temporarily disabled.');
    Object.assign(error, { statusCode: 503 });
    throw error;
  }
}
