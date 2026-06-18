import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ReviewComponent } from './review.component';
import { RunStore } from '../core/state/run.store';
import { ActivatedRoute } from '@angular/router';
import { GherkinDoc, RunStatus } from '@baia/shared';

const makeDoc = (): GherkinDoc => ({
  features: [
    {
      name: 'Feature A',
      scenarios: [
        {
          name: 'Scenario 1',
          steps: [
            { keyword: 'Given', text: 'a step', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
  generatedAt: new Date(),
});

describe('ReviewComponent', () => {
  let fixture: ComponentFixture<ReviewComponent>;
  let component: ReviewComponent;
  let store: InstanceType<typeof RunStore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'test-run-id' } } },
        },
      ],
    }).compileComponents();

    store = TestBed.inject(RunStore);
    store.reset();
  });

  it('ReviewComponent creates without error', () => {
    store.setStatus(RunStatus.Review);
    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('export disabled until approved: canExport returns false; export button disabled', () => {
    store.setStatus(RunStatus.Review);
    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();

    const exportBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="export-btn"]');
    expect(exportBtn.disabled).toBeTrue();
  });

  it('approving enables export: approve() → canExport true → export button not disabled', () => {
    store.setStatus(RunStatus.Review);
    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.approve();
    fixture.detectChanges();

    expect(component.canExport).toBeTrue();

    const exportBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="export-btn"]');
    expect(exportBtn.disabled).toBeFalse();
  });

  it('editing after approval re-gates export: approve then updateGherkinDoc → canExport false, export button disabled', () => {
    store.setStatus(RunStatus.Review);
    const doc = makeDoc();
    store.setGherkinDoc(doc);

    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.approve();
    fixture.detectChanges();
    expect(component.canExport).toBeTrue();

    const newDoc = makeDoc();
    newDoc.features[0].name = 'Modified Feature';
    store.updateGherkinDoc(newDoc);
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();

    const exportBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="export-btn"]');
    expect(exportBtn.disabled).toBeTrue();
  });

  it('approve button disabled after approval (cannot double-approve)', () => {
    store.setStatus(RunStatus.Review);
    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.approve();
    fixture.detectChanges();

    const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-approve');
    expect(approveBtn.disabled).toBeTrue();
  });

  it('approve button shows "Approved" text after approval', () => {
    store.setStatus(RunStatus.Review);
    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.approve();
    fixture.detectChanges();

    const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-approve');
    expect(approveBtn.textContent?.trim()).toBe('Approved');
  });
});
