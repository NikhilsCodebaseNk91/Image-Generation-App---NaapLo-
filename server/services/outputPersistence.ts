import { buildOutputFileName, buildProductFolderName } from '../../shared/outputFileName.ts';
import type { OutputType } from '../../shared/outputTypes.ts';
import { getDriveOutputAccessToken } from './driveSource.ts';

export interface StoredOutput {
  fileId: string;
  fileName: string;
  productFolderId: string;
  storageUrl: string;
}

const apiBase = () => (process.env.DRIVE_API_BASE_URL || 'https://www.googleapis.com/drive/v3').replace(/\/$/, '');
const uploadBase = () => (process.env.DRIVE_UPLOAD_API_BASE_URL || 'https://www.googleapis.com/upload/drive/v3').replace(/\/$/, '');
const q = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function driveJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getDriveOutputAccessToken();
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  if (!response.ok) throw new Error(`Drive output request failed with HTTP ${response.status}.`);
  return await response.json() as T;
}

async function findOrCreateProductFolder(parentFolderId: string, productId: string): Promise<string> {
  const folderName = buildProductFolderName(productId);
  const query = `'${q(parentFolderId)}' in parents and name='${q(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveJson<{ files?: Array<{ id: string }> }>(`${apiBase()}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files?.[0]?.id) return found.files[0].id;

  const created = await driveJson<{ id: string }>(`${apiBase()}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }),
  });
  return created.id;
}

export async function storeApprovedOutput(input: {
  productId: string;
  outputType: OutputType;
  base64: string;
}): Promise<StoredOutput> {
  const parentFolderId = process.env.DRIVE_OUTPUT_FOLDER_ID?.trim();
  if (!parentFolderId) throw new Error('Approved-output Drive destination is not configured.');

  const fileName = buildOutputFileName(input.productId, input.outputType);
  const productFolderId = await findOrCreateProductFolder(parentFolderId, input.productId);
  const query = `'${q(productFolderId)}' in parents and name='${q(fileName)}' and trashed=false`;
  const found = await driveJson<{ files?: Array<{ id: string }> }>(`${apiBase()}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const existingId = found.files?.[0]?.id;

  const boundary = `naaplo-${Date.now().toString(16)}`;
  const metadata = existingId ? { name: fileName } : { name: fileName, mimeType: 'image/png', parents: [productFolderId] };
  const image = Buffer.from(input.base64, 'base64');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
    image,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const method = existingId ? 'PATCH' : 'POST';
  const filePath = existingId ? `/files/${encodeURIComponent(existingId)}` : '/files';
  const stored = await driveJson<{ id: string; name: string }>(`${uploadBase()}${filePath}?uploadType=multipart&fields=id,name&supportsAllDrives=true`, {
    method,
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });

  return {
    fileId: stored.id,
    fileName: stored.name || fileName,
    productFolderId,
    storageUrl: `https://drive.google.com/file/d/${stored.id}/view`,
  };
}
