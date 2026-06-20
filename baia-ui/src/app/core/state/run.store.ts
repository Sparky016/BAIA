import { computed } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { GherkinDoc, RunRequest, RunStatus, ExploreEvent } from '@baia/shared';

export interface RunState {
  runId: string | null;
  status: RunStatus | null;
  request: RunRequest | null;
  events: ExploreEvent[];
  gherkinDoc: GherkinDoc | null;
  gherkinDocEdited: GherkinDoc | null;
  approved: boolean;
  error: string | null;
}

const initialState: RunState = {
  runId: null,
  status: null,
  request: null,
  events: [],
  gherkinDoc: null,
  gherkinDocEdited: null,
  approved: false,
  error: null,
};

export const RunStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => ({
    isRunning: computed(() => {
      const s = state.status();
      return s !== null && s !== RunStatus.Done && s !== RunStatus.Failed && s !== RunStatus.Review;
    }),
    canExport: computed(() => state.approved() && state.status() === RunStatus.Review),
    activeDoc: computed(() => state.gherkinDocEdited() ?? state.gherkinDoc()),
  })),
  withMethods((store) => ({
    setRun(runId: string, status: RunStatus): void {
      patchState(store, { runId, status, request: null, events: [], gherkinDoc: null, gherkinDocEdited: null, approved: false, error: null });
    },
    setRunWithRequest(runId: string, status: RunStatus, request: RunRequest): void {
      patchState(store, { runId, status, request, events: [], gherkinDoc: null, gherkinDocEdited: null, approved: false, error: null });
    },
    setStatus(status: RunStatus): void {
      patchState(store, { status });
    },
    appendEvent(event: ExploreEvent): void {
      patchState(store, (s) => ({ events: [...s.events, event] }));
    },
    setGherkinDoc(doc: GherkinDoc): void {
      patchState(store, { gherkinDoc: doc, gherkinDocEdited: null, approved: false });
    },
    updateGherkinDoc(doc: GherkinDoc): void {
      patchState(store, { gherkinDocEdited: doc, approved: false });
    },
    approve(): void {
      patchState(store, { approved: true });
    },
    setError(error: string): void {
      patchState(store, { error });
    },
    reset(): void {
      patchState(store, initialState);
    },
  }))
);
