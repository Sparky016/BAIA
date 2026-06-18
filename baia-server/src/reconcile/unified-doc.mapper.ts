import { DocConflict, GherkinDoc, UnifiedDoc, UnifiedFeature, UnifiedScenario, UnifiedStep } from '@baia/shared';

export class UnifiedDocMapper {
  /**
   * Build a UnifiedDoc from a GherkinDoc produced by the reconciliation service.
   *
   * Per-scenario conflictNotes are promoted to structured DocConflicts on the
   * scenario. Additional top-level conflicts (e.g. from ReconciliationOutput)
   * can be passed in separately and are attached to the document root.
   */
  static fromGherkinDoc(doc: GherkinDoc, topLevelConflicts: DocConflict[] = []): UnifiedDoc {
    const features: UnifiedFeature[] = doc.features.map((feature): UnifiedFeature => ({
      name: feature.name,
      description: feature.description,
      scenarios: feature.scenarios.map((scenario): UnifiedScenario => {
        const steps: UnifiedStep[] = scenario.steps.map((step): UnifiedStep => ({
          keyword: step.keyword,
          text: step.text,
          provenance: step.provenance,
        }));

        const unifiedScenario: UnifiedScenario = { name: scenario.name, steps };

        if (scenario.conflictNote) {
          unifiedScenario.conflicts = [
            { scenarioName: scenario.name, description: scenario.conflictNote },
          ];
        }

        return unifiedScenario;
      }),
    }));

    return {
      features,
      conflicts: topLevelConflicts,
      generatedAt: doc.generatedAt,
    };
  }

  static serialise(doc: UnifiedDoc): string {
    return JSON.stringify(doc);
  }

  static deserialise(json: string): UnifiedDoc {
    const raw = JSON.parse(json) as UnifiedDoc & { generatedAt: string };
    return { ...raw, generatedAt: new Date(raw.generatedAt) };
  }
}
