import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { ProgressComponent } from './progress.component';
import { RunStore } from '../core/state/run.store';
import { RunsApiService } from '../core/api/runs-api.service';
import { RunRequest, RunStatus } from '@baia/shared';

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
        provideHttpClient(),
        provideHttpClientTesting(),
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

  it('screenshot event with base64 updates latest screenshot in store', () => {
    fixture.detectChanges();
    const screenshotEvent = { timestamp: new Date(), type: 'screenshot', message: '', screenshotBase64: 'base64data==' };
    mockEs.onmessage!({ data: JSON.stringify(screenshotEvent) } as MessageEvent);
    expect(store.latestScreenshot()).toBe('base64data==');
  });

  it('screenshot event without base64 does not update latest screenshot', () => {
    fixture.detectChanges();
    const screenshotEvent = { timestamp: new Date(), type: 'screenshot', message: '' };
    mockEs.onmessage!({ data: JSON.stringify(screenshotEvent) } as MessageEvent);
    expect(store.latestScreenshot()).toBeNull();
  });

  it('phaseClass marks phase as active when it matches current status', () => {
    store.setStatus(RunStatus.Exploring);
    fixture.detectChanges();
    const classes = component['phaseClass']('exploring', 0);
    expect(classes['active']).toBeTrue();
  });

  it('phaseClass marks earlier phases as done when phaseIndex > 0', () => {
    store.setStatus(RunStatus.Analyzing);
    fixture.detectChanges();
    const classes = component['phaseClass']('exploring', 0);
    expect(classes['done']).toBeTrue();
  });

  it('phaseClass does not mark current or later phases as done', () => {
    store.setStatus(RunStatus.Analyzing);
    fixture.detectChanges();
    const classes = component['phaseClass']('analyzing', 1);
    expect(classes['done']).toBeFalse();
  });
});

describe('ProgressComponent — startRun branch coverage', () => {
  let fixture: ComponentFixture<ProgressComponent>;
  let component: ProgressComponent;
  let store: InstanceType<typeof RunStore>;
  let runsApiSpy: jasmine.SpyObj<RunsApiService>;
  let mockEs: MockEventSource;

  beforeEach(async () => {
    runsApiSpy = jasmine.createSpyObj('RunsApiService', [
      'createRun', 'getRun', 'startRun', 'export',
    ]) as jasmine.SpyObj<RunsApiService>;

    await TestBed.configureTestingModule({
      imports: [ProgressComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RunsApiService, useValue: runsApiSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'queued-run-id' } } },
        },
      ],
    }).compileComponents();

    store = TestBed.inject(RunStore);
    store.reset();

    fixture = TestBed.createComponent(ProgressComponent);
    component = fixture.componentInstance;

    mockEs = makeMockEventSource();
    spyOn(component as unknown as { openEventSource(url: string): EventSource }, 'openEventSource')
      .and.returnValue(mockEs as unknown as EventSource);
  });

  it('calls startRun when status is Queued and request is present', () => {
    const request: RunRequest = { targetUrl: 'https://example.com', instructions: 'do stuff' };
    store.setRunWithRequest('queued-run-id', RunStatus.Queued, request);
    runsApiSpy.startRun.and.returnValue(of({ accepted: true, runId: 'queued-run-id' }));

    fixture.detectChanges();

    expect(runsApiSpy.startRun).toHaveBeenCalledWith('queued-run-id', request);
  });

  it('does not call startRun when status is Queued but request is null', () => {
    store.setStatus(RunStatus.Queued);
    // request() will be null since we only set status, not a full run
    fixture.detectChanges();

    expect(runsApiSpy.startRun).not.toHaveBeenCalled();
  });

  it('sets store error when startRun fails', () => {
    const request: RunRequest = { targetUrl: 'https://example.com', instructions: 'do stuff' };
    store.setRunWithRequest('queued-run-id', RunStatus.Queued, request);
    runsApiSpy.startRun.and.returnValue(throwError(() => new Error('Pipeline failed')));

    fixture.detectChanges();

    expect(store.error()).toBe('Pipeline failed');
  });

  it('does not call startRun when status is not Queued', () => {
    store.setStatus(RunStatus.Exploring);
    fixture.detectChanges();

    expect(runsApiSpy.startRun).not.toHaveBeenCalled();
  });
});
