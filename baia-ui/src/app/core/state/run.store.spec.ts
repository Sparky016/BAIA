import { TestBed } from '@angular/core/testing';
import { RunStore } from './run.store';
import { RunStatus, GherkinDoc, ExploreEvent } from '@baia/shared';

const makeDoc = (name: string): GherkinDoc => ({
  features: [
    {
      name,
      scenarios: [
        {
          name: 'Scenario A',
          steps: [
            { keyword: 'Given', text: 'a step', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
  generatedAt: new Date(),
});

const makeEvent = (): ExploreEvent => ({
  timestamp: new Date(),
  type: 'action',
  message: 'clicked something',
});

describe('RunStore', () => {
  let store: InstanceType<typeof RunStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(RunStore);
    store.reset();
  });

  it('initial state: all null/false/empty', () => {
    expect(store.runId()).toBeNull();
    expect(store.status()).toBeNull();
    expect(store.events()).toEqual([]);
    expect(store.gherkinDoc()).toBeNull();
    expect(store.gherkinDocEdited()).toBeNull();
    expect(store.approved()).toBeFalse();
    expect(store.error()).toBeNull();
  });

  it('setRun: sets runId, status, clears events/doc/approved', () => {
    const doc = makeDoc('Feature A');
    store.setGherkinDoc(doc);
    store.approve();
    store.appendEvent(makeEvent());

    store.setRun('run-1', RunStatus.Exploring);

    expect(store.runId()).toBe('run-1');
    expect(store.status()).toBe(RunStatus.Exploring);
    expect(store.events()).toEqual([]);
    expect(store.gherkinDoc()).toBeNull();
    expect(store.gherkinDocEdited()).toBeNull();
    expect(store.approved()).toBeFalse();
    expect(store.error()).toBeNull();
  });

  it('setStatus: updates status', () => {
    store.setStatus(RunStatus.Analyzing);
    expect(store.status()).toBe(RunStatus.Analyzing);
  });

  it('appendEvent: adds event to array', () => {
    const e1 = makeEvent();
    const e2 = makeEvent();
    store.appendEvent(e1);
    store.appendEvent(e2);
    expect(store.events().length).toBe(2);
    expect(store.events()[0]).toBe(e1);
    expect(store.events()[1]).toBe(e2);
  });

  it('setGherkinDoc: sets doc, clears edited + approved', () => {
    const doc1 = makeDoc('Feature A');
    const doc2 = makeDoc('Feature B');
    store.setGherkinDoc(doc1);
    store.updateGherkinDoc(doc2);
    store.approve();

    const newDoc = makeDoc('Feature C');
    store.setGherkinDoc(newDoc);

    expect(store.gherkinDoc()).toBe(newDoc);
    expect(store.gherkinDocEdited()).toBeNull();
    expect(store.approved()).toBeFalse();
  });

  it('updateGherkinDoc: sets edited doc, approved becomes false', () => {
    const doc = makeDoc('Feature A');
    store.setRun('run-1', RunStatus.Review);
    store.setGherkinDoc(doc);
    store.approve();
    expect(store.approved()).toBeTrue();

    const edited = makeDoc('Feature A Edited');
    store.updateGherkinDoc(edited);

    expect(store.gherkinDocEdited()).toBe(edited);
    expect(store.approved()).toBeFalse();
  });

  it('approve: sets approved to true', () => {
    store.approve();
    expect(store.approved()).toBeTrue();
  });

  describe('isRunning', () => {
    it('returns false when status is null', () => {
      expect(store.isRunning()).toBeFalse();
    });

    it('returns true when Exploring', () => {
      store.setStatus(RunStatus.Exploring);
      expect(store.isRunning()).toBeTrue();
    });

    it('returns true when Queued', () => {
      store.setStatus(RunStatus.Queued);
      expect(store.isRunning()).toBeTrue();
    });

    it('returns false when Done', () => {
      store.setStatus(RunStatus.Done);
      expect(store.isRunning()).toBeFalse();
    });

    it('returns false when Failed', () => {
      store.setStatus(RunStatus.Failed);
      expect(store.isRunning()).toBeFalse();
    });

    it('returns false when Review', () => {
      store.setStatus(RunStatus.Review);
      expect(store.isRunning()).toBeFalse();
    });
  });

  describe('canExport', () => {
    it('returns false when not approved', () => {
      store.setStatus(RunStatus.Review);
      expect(store.canExport()).toBeFalse();
    });

    it('returns false when approved but status is not Review', () => {
      store.setStatus(RunStatus.Done);
      store.approve();
      expect(store.canExport()).toBeFalse();
    });

    it('returns true when approved and status is Review', () => {
      store.setStatus(RunStatus.Review);
      store.approve();
      expect(store.canExport()).toBeTrue();
    });
  });

  describe('activeDoc', () => {
    it('returns editedDoc when present', () => {
      const original = makeDoc('Original');
      const edited = makeDoc('Edited');
      store.setGherkinDoc(original);
      store.updateGherkinDoc(edited);
      expect(store.activeDoc()).toBe(edited);
    });

    it('falls back to gherkinDoc when no edited doc', () => {
      const original = makeDoc('Original');
      store.setGherkinDoc(original);
      expect(store.activeDoc()).toBe(original);
    });

    it('returns null when neither doc is set', () => {
      expect(store.activeDoc()).toBeNull();
    });
  });
});
