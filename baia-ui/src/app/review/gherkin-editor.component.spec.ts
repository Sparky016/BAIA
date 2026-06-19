import { TestBed, ComponentFixture } from '@angular/core/testing';
import { GherkinEditorComponent } from './gherkin-editor.component';
import { RunStore } from '../core/state/run.store';
import { GherkinDoc, RunStatus } from '@baia/shared';

const makeDoc = (): GherkinDoc => ({
  features: [
    {
      name: 'Feature A',
      description: 'A feature',
      scenarios: [
        {
          name: 'Scenario 1',
          steps: [
            { keyword: 'Given', text: 'a precondition', provenance: 'ui' },
            { keyword: 'When', text: 'an action occurs', provenance: 'code' },
            { keyword: 'Then', text: 'a result is expected', provenance: 'merged' },
          ],
        },
      ],
    },
  ],
  generatedAt: new Date(),
});

describe('GherkinEditorComponent', () => {
  let fixture: ComponentFixture<GherkinEditorComponent>;
  let component: GherkinEditorComponent;
  let store: InstanceType<typeof RunStore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GherkinEditorComponent],
    }).compileComponents();

    store = TestBed.inject(RunStore);
    store.reset();
  });

  it('creates component without error', () => {
    store.setStatus(RunStatus.Review);
    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('ngOnInit: loads activeDoc from store into editableDoc', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const editableDoc = (component as unknown as { editableDoc: GherkinDoc | null }).editableDoc;
    expect(editableDoc).not.toBeNull();
    expect(editableDoc?.features[0].name).toBe('Feature A');
  });

  it('updateStepText: updates step text and calls store.updateGherkinDoc', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc').and.callThrough();
    component.updateStepText(0, 0, 0, 'updated step text');

    expect(store.updateGherkinDoc).toHaveBeenCalled();
    const updatedArg = (store.updateGherkinDoc as jasmine.Spy).calls.mostRecent().args[0] as GherkinDoc;
    expect(updatedArg.features[0].scenarios[0].steps[0].text).toBe('updated step text');
  });

  it('updateFeatureName: updates feature name and calls store.updateGherkinDoc', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc').and.callThrough();
    component.updateFeatureName(0, 'New Feature Name');

    expect(store.updateGherkinDoc).toHaveBeenCalled();
    const updatedArg = (store.updateGherkinDoc as jasmine.Spy).calls.mostRecent().args[0] as GherkinDoc;
    expect(updatedArg.features[0].name).toBe('New Feature Name');
  });

  it('updateScenarioName: updates scenario name and calls store.updateGherkinDoc', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc').and.callThrough();
    component.updateScenarioName(0, 0, 'New Scenario Name');

    expect(store.updateGherkinDoc).toHaveBeenCalled();
    const updatedArg = (store.updateGherkinDoc as jasmine.Spy).calls.mostRecent().args[0] as GherkinDoc;
    expect(updatedArg.features[0].scenarios[0].name).toBe('New Scenario Name');
  });

  it('provenance badges display correctly (data-provenance attribute set)', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('.provenance-badge');
    expect(badges.length).toBe(3);
    expect(badges[0].getAttribute('data-provenance')).toBe('ui');
    expect(badges[1].getAttribute('data-provenance')).toBe('code');
    expect(badges[2].getAttribute('data-provenance')).toBe('merged');
  });

  it('shows "No Gherkin document available." when doc is null', () => {
    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No Gherkin document available.');
  });

  it('updateStepText is a no-op when editableDoc is null', () => {
    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc');
    component.updateStepText(0, 0, 0, 'text');
    expect(store.updateGherkinDoc).not.toHaveBeenCalled();
  });

  it('updateFeatureName is a no-op when editableDoc is null', () => {
    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc');
    component.updateFeatureName(0, 'name');
    expect(store.updateGherkinDoc).not.toHaveBeenCalled();
  });

  it('updateScenarioName is a no-op when editableDoc is null', () => {
    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc');
    component.updateScenarioName(0, 0, 'name');
    expect(store.updateGherkinDoc).not.toHaveBeenCalled();
  });

  it('updateStepText is a no-op when step index is out of bounds', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc');
    component.updateStepText(0, 0, 99, 'text');
    expect(store.updateGherkinDoc).not.toHaveBeenCalled();
  });

  it('updateFeatureName is a no-op when feature index is out of bounds', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc');
    component.updateFeatureName(99, 'name');
    expect(store.updateGherkinDoc).not.toHaveBeenCalled();
  });

  it('updateScenarioName is a no-op when scenario index is out of bounds', () => {
    const doc = makeDoc();
    store.setGherkinDoc(doc);
    store.setStatus(RunStatus.Review);

    fixture = TestBed.createComponent(GherkinEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    spyOn(store, 'updateGherkinDoc');
    component.updateScenarioName(0, 99, 'name');
    expect(store.updateGherkinDoc).not.toHaveBeenCalled();
  });
});
