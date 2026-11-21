import type { ScanReport, AiScorerResult, MultiAiReport, DimensionScores } from './types.js';

export function mergeScores(ruleReport: ScanReport, aiScores: AiScorerResult[]): MultiAiReport {
  const availableAiScores = aiScores.filter((s) => s.available && s.score > 0);
  const ruleScore = ruleReport.overall.total;

  let consensusScore: number;
  let methodology: string;

  if (availableAiScores.length === 0) {
    // No AI scores — rule engine only
    consensusScore = ruleScore;
    methodology = 'Rule engine only (no AI CLIs available)';
  } else if (availableAiScores.length === 1) {
    // One AI + rule engine: 60/40
    const aiAvg = availableAiScores[0].score;
    consensusScore = Math.round(ruleScore * 0.6 + aiAvg * 0.4);
    methodology = `Experimental blend: rule engine (60%) + ${availableAiScores[0].source} review (40%); not an outcome prediction`;
  } else {
    // Multiple AIs + rule engine: 50/50
    const aiAvg = Math.round(availableAiScores.reduce((sum, s) => sum + s.score, 0) / availableAiScores.length);
    consensusScore = Math.round(ruleScore * 0.5 + aiAvg * 0.5);
    const sources = availableAiScores.map((s) => s.source).join(', ');
    methodology = `Experimental blend: rule engine (50%) + AI review mean [${sources}] (50%); not an outcome prediction`;
  }

  // Merge per-dimension scores if AI data available
  const aiDims = averageAiDimensions(availableAiScores);
  const ruleWeight = availableAiScores.length >= 2 ? 0.5 : availableAiScores.length === 1 ? 0.6 : 1.0;
  const aiWeight = 1.0 - ruleWeight;

  const dimMax: Record<string, number> = { structure: 25, citability: 25, schema: 20, aiMetadata: 15, contentDensity: 15 };
  const mergedOverall: DimensionScores = { ...ruleReport.overall, total: consensusScore };
  if (aiDims) {
    const dims: (keyof Omit<DimensionScores, 'total'>)[] = ['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity'];
    for (const dim of dims) {
      mergedOverall[dim] = Math.min(dimMax[dim], Math.max(0, Math.round(ruleReport.overall[dim] * ruleWeight + aiDims[dim] * aiWeight)));
    }
  }

  return {
    ...ruleReport,
    overall: mergedOverall,
    ruleScore,
    aiScores,
    consensusScore,
    methodology,
  };
}

export function averageAiDimensions(aiScores: AiScorerResult[]): DimensionScores | null {
  const available = aiScores.filter((s) => s.available && s.score > 0);
  if (available.length === 0) return null;

  const dims: (keyof Omit<DimensionScores, 'total'>)[] = ['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity'];
  const avg: DimensionScores = { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 };

  for (const dim of dims) {
    avg[dim] = Math.round(available.reduce((sum, s) => sum + s.dimensions[dim], 0) / available.length);
  }
  avg.total = avg.structure + avg.citability + avg.schema + avg.aiMetadata + avg.contentDensity;

  return avg;
}
