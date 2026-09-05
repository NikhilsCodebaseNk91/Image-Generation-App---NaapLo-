import crypto from 'node:crypto';
import fs from 'node:fs';

export const DRIVE_SOURCE_IDS = {
  masterPrompt: '1fo9itawW0tmmNZki8oGCH2fbcuCgokau',
  logo: '1GNRrbtANgGlzuq5FPtU7duJjMEiyQmnX',
  multipleOutfit: '13XNkfu35GNBodG1kTnmTmzJ_4Z6Ks3-C',
} as const;

export interface DriveFileContent {
  fileId: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  data: Buffer;
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GoogleOAuthClientCredentials {
  client_id: string;
  client_secret: string;
  auth_uri: string;
  token_uri: string;
  redirect_uris: string[];
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let cachedOutputAccessToken: { value: string; expiresAt: number } | null = null;

const encodeBase64Url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function parseServiceAccount(): ServiceAccountCredentials | null {
  const credentialPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_FILE?.trim();
  const raw = credentialPath
    ? fs.readFileSync(credentialPath, 'utf8').trim()
    : process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  const decoded = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(decoded) as ServiceAccountCredentials;
  if (!parsed.client_email || !parsed.private_key) throw new Error('Google service-account credentials are missing client_email or private_key.');
  return parsed;
}

export function loadGoogleOAuthClient(): GoogleOAuthClientCredentials | null {
  const credentialPath = process.env.GOOGLE_OAUTH_CLIENT_JSON_FILE?.trim();
  const raw = credentialPath
    ? fs.readFileSync(credentialPath, 'utf8').trim()
    : process.env.GOOGLE_OAUTH_CLIENT_JSON?.trim();
  if (!raw) return null;
  const decoded = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const document = JSON.parse(decoded) as { web?: GoogleOAuthClientCredentials; installed?: GoogleOAuthClientCredentials };
  const credentials = document.web || document.installed;
  if (!credentials?.client_id || !credentials.client_secret || !credentials.token_uri || !credentials.redirect_uris?.length) {
    throw new Error('Google OAuth client credentials are incomplete.');
  }
  return credentials;
}

function readGoogleOAuthRefreshToken(): string | null {
  const direct = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (direct) return direct;
  const tokenPath = process.env.GOOGLE_OAUTH_REFRESH_TOKEN_FILE?.trim();
  if (!tokenPath || !fs.existsSync(tokenPath)) return null;
  const raw = fs.readFileSync(tokenPath, 'utf8').trim();
  if (!raw) return null;
  if (!raw.startsWith('{')) return raw;
  const parsed = JSON.parse(raw) as { refresh_token?: string };
  return parsed.refresh_token?.trim() || null;
}

async function createOAuthAccessToken(
  credentials: GoogleOAuthClientCredentials,
  refreshToken: string
): Promise<{ value: string; expiresAt: number }> {
  const response = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || `Google OAuth token refresh failed with HTTP ${response.status}.`);
  }
  return { value: payload.access_token, expiresAt: Date.now() + Math.max(60, (payload.expires_in || 3600) - 60) * 1000 };
}

async function createServiceAccountToken(credentials: ServiceAccountCredentials): Promise<{ value: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(credentials.private_key);
  const assertion = `${unsigned}.${encodeBase64Url(signature)}`;
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || `Drive authentication failed with HTTP ${response.status}.`);
  return { value: payload.access_token, expiresAt: Date.now() + Math.max(60, (payload.expires_in || 3600) - 60) * 1000 };
}

export async function getDriveAccessToken(): Promise<string> {
  const direct = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (direct) return direct;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value;
  const credentials = parseServiceAccount();
  if (!credentials) throw new Error('Drive is enabled but no server-side Drive credential is configured.');
  cachedAccessToken = await createServiceAccountToken(credentials);
  return cachedAccessToken.value;
}

export async function getDriveOutputAccessToken(): Promise<string> {
  const direct = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (direct) return direct;
  if (cachedOutputAccessToken && cachedOutputAccessToken.expiresAt > Date.now()) return cachedOutputAccessToken.value;
  const oauthClient = loadGoogleOAuthClient();
  const refreshToken = readGoogleOAuthRefreshToken();
  if (oauthClient && refreshToken) {
    cachedOutputAccessToken = await createOAuthAccessToken(oauthClient, refreshToken);
    return cachedOutputAccessToken.value;
  }
  return getDriveAccessToken();
}

export function isDriveOutputStorageConfigured(): boolean {
  if (!process.env.DRIVE_OUTPUT_FOLDER_ID?.trim()) return false;
  if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim()) return true;
  if (loadGoogleOAuthClient() && readGoogleOAuthRefreshToken()) return true;
  return Boolean(parseServiceAccount());
}

export function isDriveEnabled(): boolean {
  return process.env.DRIVE_ENABLED?.trim().toLowerCase() === 'true';
}

export async function fetchDriveFile(fileId: string, allowedMimeTypes: string[], maxBytes: number): Promise<DriveFileContent> {
  const token = await getDriveAccessToken();
  const apiBase = (process.env.DRIVE_API_BASE_URL || 'https://www.googleapis.com/drive/v3').replace(/\/$/, '');
  const headers = { authorization: `Bearer ${token}` };
  const metadataResponse = await fetch(`${apiBase}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,size&supportsAllDrives=true`, { headers });
  if (!metadataResponse.ok) throw new Error(`Drive metadata request failed with HTTP ${metadataResponse.status}.`);
  const metadata = await metadataResponse.json() as { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string };
  if (!allowedMimeTypes.includes(metadata.mimeType)) throw new Error(`Drive file ${fileId} has unsupported MIME type ${metadata.mimeType}.`);
  if (metadata.size && Number(metadata.size) > maxBytes) throw new Error(`Drive file ${fileId} exceeds the ${maxBytes}-byte safety limit.`);

  const contentResponse = await fetch(`${apiBase}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers });
  if (!contentResponse.ok) throw new Error(`Drive content request failed with HTTP ${contentResponse.status}.`);
  const data = Buffer.from(await contentResponse.arrayBuffer());
  if (data.length === 0 || data.length > maxBytes) throw new Error(`Drive file ${fileId} returned an invalid payload size.`);
  return { fileId, name: metadata.name, mimeType: metadata.mimeType, modifiedTime: metadata.modifiedTime, data };
}

export function resetDriveSourceCacheForTests() {
  cachedAccessToken = null;
  cachedOutputAccessToken = null;
}
