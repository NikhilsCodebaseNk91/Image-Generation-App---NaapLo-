import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BatchQuality, BatchStatus, BatchViewStatus } from '../../shared/batchTypes.ts';
import type { OutputType } from '../../shared/outputTypes.ts';
import type { GenerateApiResponse, ImageFilePayload } from '../../shared/types.ts';

export interface StoredBatchView {
  outputType: OutputType;
  status: BatchViewStatus;
  attempts: number;
  error?: string;
  correction?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  identityUsed?: boolean;
  provider?: string;
  model?: string;
  fileName?: string;
  mimeType?: string;
  approvedAt?: string;
  storageUrl?: string;
}

export interface StoredCatalogue {
  id: string;
  batchId: string;
  productId: string;
  operatorTag?: string;
  quality: BatchQuality;
  outputTypes: OutputType[];
  closeUpTarget?: string;
  instructions?: string;
  referenceImages: Array<{ name: string; mimeType: string; fileName: string }>;
  views: StoredBatchView[];
  createdAt: string;
  completedAt?: string;
}

export interface StoredBatch {
  id: string;
  status: BatchStatus;
  expectedCatalogueCount: number;
  defaultOutputTypes: OutputType[];
  defaultQuality: BatchQuality;
  catalogueIds: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

const assertId = (value: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error('Invalid batch record identifier.');
  return value;
};

const writeLocks = new Map<string, Promise<void>>();

async function writeJsonAtomic(filePath: string, value: unknown) {
  const previous = writeLocks.get(filePath) || Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    const backup = `${filePath}.bak`;
    await writeFile(temporary, JSON.stringify(value));
    await rm(backup, { force: true });
    try { await rename(filePath, backup); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try {
      await rename(temporary, filePath);
      await rm(backup, { force: true });
    } catch (error) {
      try { await rename(backup, filePath); } catch { /* the original may not have existed */ }
      throw error;
    }
  });
  writeLocks.set(filePath, operation);
  try { await operation; } finally { if (writeLocks.get(filePath) === operation) writeLocks.delete(filePath); }
}

async function readJson<T>(filePath: string): Promise<T> {
  await writeLocks.get(filePath)?.catch(() => undefined);
  try { return JSON.parse(await readFile(filePath, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return JSON.parse(await readFile(`${filePath}.bak`, 'utf8')) as T;
  }
}

export class BatchStore {
  private readonly baseRoot: string;

  constructor(baseRoot = process.env.BATCH_DATA_DIR?.trim() || path.join(process.cwd(), '.data', 'batches')) {
    this.baseRoot = path.resolve(baseRoot);
  }

  private batchDir(batchId: string) { return path.join(this.baseRoot, assertId(batchId)); }
  private catalogueDir(batchId: string, catalogueId: string) { return path.join(this.batchDir(batchId), 'catalogues', assertId(catalogueId)); }

  async createBatch(input: Omit<StoredBatch, 'id' | 'catalogueIds' | 'createdAt'>): Promise<StoredBatch> {
    const batch: StoredBatch = { ...input, id: randomUUID(), catalogueIds: [], createdAt: new Date().toISOString() };
    await this.saveBatch(batch);
    return batch;
  }

  async loadBatch(batchId: string): Promise<StoredBatch> {
    return readJson<StoredBatch>(path.join(this.batchDir(batchId), 'batch.json'));
  }

  async saveBatch(batch: StoredBatch): Promise<void> {
    await writeJsonAtomic(path.join(this.batchDir(batch.id), 'batch.json'), batch);
  }

  async listBatches(limit = 20): Promise<StoredBatch[]> {
    await mkdir(this.baseRoot, { recursive: true });
    const entries = await readdir(this.baseRoot, { withFileTypes: true });
    const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try { return await this.loadBatch(entry.name); } catch { return null; }
    }));
    return records.filter((record): record is StoredBatch => Boolean(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async createCatalogue(batchId: string, input: Omit<StoredCatalogue, 'id' | 'batchId' | 'createdAt' | 'referenceImages'> & { referenceImages: ImageFilePayload[] }): Promise<StoredCatalogue> {
    const id = randomUUID();
    const referenceImages: StoredCatalogue['referenceImages'] = [];
    for (let index = 0; index < input.referenceImages.length; index += 1) {
      const image = input.referenceImages[index];
      const fileName = `${String(index + 1).padStart(2, '0')}.bin`;
      const referencePath = path.join(this.catalogueDir(batchId, id), 'references', fileName);
      await mkdir(path.dirname(referencePath), { recursive: true });
      const base64 = image.data.startsWith('data:') ? image.data.slice(image.data.indexOf(',') + 1) : image.data;
      await writeFile(referencePath, Buffer.from(base64, 'base64'));
      referenceImages.push({ name: image.name, mimeType: image.mimeType, fileName });
    }
    const { referenceImages: _payloads, ...metadata } = input;
    const catalogue: StoredCatalogue = { ...metadata, referenceImages, id, batchId, createdAt: new Date().toISOString() };
    await this.saveCatalogue(catalogue);
    return catalogue;
  }

  async loadCatalogue(batchId: string, catalogueId: string): Promise<StoredCatalogue> {
    return readJson<StoredCatalogue>(path.join(this.catalogueDir(batchId, catalogueId), 'catalogue.json'));
  }

  async saveCatalogue(catalogue: StoredCatalogue): Promise<void> {
    await writeJsonAtomic(path.join(this.catalogueDir(catalogue.batchId, catalogue.id), 'catalogue.json'), catalogue);
  }

  async loadReferenceImages(catalogue: StoredCatalogue): Promise<ImageFilePayload[]> {
    return Promise.all(catalogue.referenceImages.map(async (image) => ({
      name: image.name,
      mimeType: image.mimeType,
      data: (await readFile(path.join(this.catalogueDir(catalogue.batchId, catalogue.id), 'references', image.fileName))).toString('base64'),
    })));
  }

  async saveResult(batchId: string, catalogueId: string, outputType: OutputType, result: GenerateApiResponse): Promise<void> {
    if (!result.image?.base64) throw new Error('Generated result has no image payload.');
    const resultPath = this.resultPath(batchId, catalogueId, outputType);
    await mkdir(path.dirname(resultPath), { recursive: true });
    const temporary = `${resultPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, Buffer.from(result.image.base64, 'base64'));
    await rename(temporary, resultPath);
  }

  async loadResultBase64(batchId: string, catalogueId: string, outputType: OutputType): Promise<string> {
    return (await readFile(this.resultPath(batchId, catalogueId, outputType))).toString('base64');
  }

  private resultPath(batchId: string, catalogueId: string, outputType: OutputType): string {
    const safeType = outputType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return path.join(this.catalogueDir(batchId, catalogueId), 'results', `${safeType}.png`);
  }
}
