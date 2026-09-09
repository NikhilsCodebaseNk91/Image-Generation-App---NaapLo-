import { readFile } from 'node:fs/promises';

interface Candidate { id: string; provider: string; model: string; estimatedOutputCostUsd: number; }
interface BenchmarkCase { id: string; productId: string; outputTypes: string[]; }
interface Rating {
  candidateId: string;
  caseId: string;
  outputType: string;
  garmentFidelity: number;
  identityContinuity: number;
  catalogueUsability: number;
  usable: boolean;
  latencyMs: number;
  accountedCostUsd: number;
}
interface Manifest { contractVersion: 'provider-benchmark.v1'; maxBudgetUsd: number; candidates: Candidate[]; cases: BenchmarkCase[]; ratings?: Rating[]; }

const manifestPath = process.argv[2] || 'config/provider-benchmark.json';
const mode = process.argv.includes('--score') ? 'score' : 'plan';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;

if (manifest.contractVersion !== 'provider-benchmark.v1') throw new Error('Expected provider-benchmark.v1.');
if (!manifest.candidates.length || !manifest.cases.length) throw new Error('At least one candidate and case are required.');
if (!Number.isFinite(manifest.maxBudgetUsd) || manifest.maxBudgetUsd <= 0) throw new Error('maxBudgetUsd must be positive.');

const plannedRequests = manifest.candidates.flatMap((candidate) => manifest.cases.flatMap((testCase) =>
  testCase.outputTypes.map((outputType) => ({ candidateId: candidate.id, caseId: testCase.id, outputType, estimatedOutputCostUsd: candidate.estimatedOutputCostUsd }))));
const estimatedOutputCostUsd = plannedRequests.reduce((sum, request) => sum + request.estimatedOutputCostUsd, 0);
if (estimatedOutputCostUsd > manifest.maxBudgetUsd) throw new Error(`Planned output estimate $${estimatedOutputCostUsd.toFixed(3)} exceeds the $${manifest.maxBudgetUsd.toFixed(2)} cap.`);

if (mode === 'plan') {
  console.log(JSON.stringify({
    mode,
    plannedRequests: plannedRequests.length,
    estimatedOutputCostUsd,
    maxBudgetUsd: manifest.maxBudgetUsd,
    remainingBudgetForInputsUsd: manifest.maxBudgetUsd - estimatedOutputCostUsd,
    warning: 'This command never calls a provider. Live execution requires a separate, explicit owner approval.',
    requests: plannedRequests,
  }, null, 2));
  process.exit(0);
}

const ratings = manifest.ratings || [];
const expected = new Set(plannedRequests.map((item) => `${item.candidateId}|${item.caseId}|${item.outputType}`));
const received = new Set(ratings.map((item) => `${item.candidateId}|${item.caseId}|${item.outputType}`));
const missing = [...expected].filter((key) => !received.has(key));
if (missing.length) throw new Error(`Missing ${missing.length} rating(s): ${missing.join(', ')}`);
for (const rating of ratings) {
  for (const score of [rating.garmentFidelity, rating.identityContinuity, rating.catalogueUsability]) {
    if (!Number.isFinite(score) || score < 1 || score > 5) throw new Error('Benchmark scores must be between 1 and 5.');
  }
}

const results = manifest.candidates.map((candidate) => {
  const rows = ratings.filter((rating) => rating.candidateId === candidate.id);
  const usable = rows.filter((rating) => rating.usable);
  const totalCostUsd = rows.reduce((sum, rating) => sum + rating.accountedCostUsd, 0);
  const mean = (field: 'garmentFidelity' | 'identityContinuity' | 'catalogueUsability') => rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
  return {
    candidateId: candidate.id,
    provider: candidate.provider,
    model: candidate.model,
    samples: rows.length,
    usableOutputs: usable.length,
    usableRate: usable.length / rows.length,
    garmentFidelity: mean('garmentFidelity'),
    identityContinuity: mean('identityContinuity'),
    catalogueUsability: mean('catalogueUsability'),
    averageLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length,
    totalCostUsd,
    costPerUsableOutputUsd: usable.length ? totalCostUsd / usable.length : null,
    passesQualityGate: usable.length / rows.length >= 0.75 && mean('garmentFidelity') >= 4 && mean('identityContinuity') >= 3.5,
  };
});
console.log(JSON.stringify({ mode, results }, null, 2));
