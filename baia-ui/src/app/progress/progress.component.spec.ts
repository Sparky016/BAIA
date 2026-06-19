import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ProgressComponent } from './progress.component';
import { RunStore } from '../core/state/run.store';
import { RunStatus } from '@baia/shared';

interface MockEventSource {
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  close: jasmine.Spy;
}

function makeMockEventSource(): MockEventSource {
  return { onmessage: null, onerror: null, close: jasmine.createSpy('close') };
}

describe('ProgressComponent', () => {
  let fixture: ComponentFixture<ProgressComponent>;
  let component: ProgressComponent;
  let store: InstanceType<typeof RunStore>;
  let router: Router;
  let mockEs: MockEventSource;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'test-run-id' } } },
        },
      ],
    }).compileComponents();

    store = TestBed.inject(RunStore);
    store.reset();
    router = TestBed.inject(Router);

    fixture = TestBed.createComponent(ProgressComponent);
    component = fixture.componentInstance;

    mockEs = makeMockEventSource();
    spyOn(component as unknown as { openEventSource(url: string): EventSource }, 'openEventSource')
      .and.returnValue(mockEs as unknown as EventSource);
  });

  it('creates without error', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('runId is taken from route params', () => {
    fixture.detectChanges();
    expect(component.runId).toBe('test-run-id');
  });

  it('displays run-id in template', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('[data-testid="run-id"]');
    expect(el.textContent?.trim()).toBe('test-run-id');
  });

  it('shows "no events" placeholder initially', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('[data-testid="no-events"]');
    expect(el).toBeTruthy();
  });

  it('opens an EventSource for /api/runs/:id/events on init', () => {
    fixture.detectChanges();
    expect((component as unknown as { openEventSource: jasmine.Spy }).openEventSource)
      .toHaveBeenCalledWith('/api/runs/test-run-id/events');
  });

  it('transition event updates store status', () => {
    fixture.detectChanges();
    const transitionEvent = { runId: 'test-run-id', from: RunStatus.Queued, to: RunStatus.Exploring, at: Date.now() };
    mockEs.onmessage!({ data: JSON.stringify(transitionEvent) } as MessageEvent);
    expect(store.status()).toBe(RunStatus.Exploring);
  });

  it('explore event is appended to store', () => {
    fixture.detectChanges();
    const exploreEvent = { timestamp: new Date(), type: 'action', message: 'Clicked button' };
    mockEs.onmessage!({ data: JSON.stringify(exploreEvent) } as MessageEvent);
    expect(store.events().length).toBe(1);
    expect(store.events()[0].message).toBe('Clicked button');
  });

  it('navigates to /review/:id when status transitions to Review', () => {
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    fixture.detectChanges();

    const transitionEvent = { runId: 'test-run-id', from: RunStatus.Reconciling, to: RunStatus.Review, at: Date.now() };
    mockEs.onmessage!({ data: JSON.stringify(transitionEvent) } as MessageEvent);

    expect(router.navigate).toHaveBeenCalledWith(['/review', 'test-run-id']);
  });

  it('non-Review transition does not navigate', () => {
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    fixture.detectChanges();

    const transitionEvent = { runId: 'test-run-id', from: RunStatus.Queued, to: RunStatus.Exploring, at: Date.now() };
    mockEs.onmessage!({ data: JSON.stringify(transitionEvent) } as MessageEvent);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('closes EventSource on error', () => {
    fixture.detectChanges();
    mockEs.onerror!();
    expect(mockEs.close).toHaveBeenCalled();
  });

  it('closes EventSource on destroy', () => {
    fixture.detectChanges();
    fixture.destroy();
    expect(mockEs.close).toHaveBeenCalled();
  });

  it('shows events log when events are present', () => {
    store.appendEvent({ timestamp: new Date(), type: 'action', message: 'Test event' });
    fixture.detectChanges();

    const log: HTMLElement = fixture.nativeElement.querySelector('[data-testid="events-log"]');
    expect(log).toBeTruthy();
    expect(log.textContent).toContain('Test event');
  });

  it('displays current run status in template', () => {
    store.setStatus(RunStatus.Exploring);
    fixture.detectChanges();

    const statusEl: HTMLElement = fixture.nativeElement.querySelector('[data-testid="run-status"]');
    expect(statusEl.textContent).toContain(RunStatus.Exploring);
  });
});
