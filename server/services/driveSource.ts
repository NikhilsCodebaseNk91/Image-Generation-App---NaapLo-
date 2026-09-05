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

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

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

async function createServiceAccountToken(credentials: ServiceAccountCredentials): Promise<{ value: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
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

async function getAccessToken(): Promise<string> {
  const direct = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (direct) return direct;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value;
  const credentials = parseServiceAccount();
  if (!credentials) throw new Error('Drive is enabled but no server-side Drive credential is configured.');
  cachedAccessToken = await createServiceAccountToken(credentials);
  return cachedAccessToken.value;
}

export function isDriveEnabled(): boolean {
  return process.env.DRIVE_ENABLED?.trim().toLowerCase() === 'true';
}

export async function fetchDriveFile(fileId: string, allowedMimeTypes: string[], maxBytes: number): Promise<DriveFileContent> {
  const token = await getAccessToken();
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
}
