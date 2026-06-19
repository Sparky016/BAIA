import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InputComponent } from './input.component';
import { RunsApiService } from '../core/api/runs-api.service';
import { RunStore } from '../core/state/run.store';
import { RunStatus } from '@baia/shared';

const VALID_FORM = {
  targetUrl: 'https://example.com',
  instructions: 'Click the start button',
  repoUrl: 'https://github.com/org/repo',
  repoProvider: 'github' as const,
  credentialsRef: 'my-secret',
};

describe('InputComponent', () => {
  let fixture: ComponentFixture<InputComponent>;
  let component: InputComponent;
  let runsApiSpy: jasmine.SpyObj<RunsApiService>;
  let router: Router;
  let store: InstanceType<typeof RunStore>;

  beforeEach(async () => {
    runsApiSpy = jasmine.createSpyObj<RunsApiService>('RunsApiService', ['createRun', 'getRun', 'export']);

    await TestBed.configureTestingModule({
      imports: [InputComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: RunsApiService, useValue: runsApiSpy },
      ],
    }).compileComponents();

    store = TestBed.inject(RunStore);
    store.reset();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(InputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates without error', () => {
    expect(component).toBeTruthy();
  });

  it('form is invalid when empty', () => {
    expect(component.form.invalid).toBeTrue();
  });

  it('form is valid when all required fields are filled', () => {
    component.form.setValue(VALID_FORM);
    expect(component.form.valid).toBeTrue();
  });

  it('targetUrl rejects non-URL values', () => {
    const ctrl = component.form.get('targetUrl')!;
    ctrl.setValue('not-a-url');
    ctrl.markAsTouched();
    expect(ctrl.invalid).toBeTrue();
  });

  it('targetUrl accepts http and https URLs', () => {
    const ctrl = component.form.get('targetUrl')!;
    ctrl.setValue('https://example.com/path');
    expect(ctrl.valid).toBeTrue();
    ctrl.setValue('http://localhost:3000');
    expect(ctrl.valid).toBeTrue();
  });

  it('start button is disabled when form is invalid', () => {
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-btn"]');
    expect(btn.disabled).toBeTrue();
  });

  it('start button is enabled when form is valid', () => {
    component.form.setValue(VALID_FORM);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-btn"]');
    expect(btn.disabled).toBeFalse();
  });

  it('submit() is a no-op when form is invalid', () => {
    component.submit();
    expect(runsApiSpy.createRun).not.toHaveBeenCalled();
  });

  it('submit() calls createRun with correct payload', () => {
    runsApiSpy.createRun.and.returnValue(of({
      runId: 'run-001',
      status: RunStatus.Queued,
      targetUrl: 'https://example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    component.form.setValue(VALID_FORM);
    component.submit();

    expect(runsApiSpy.createRun).toHaveBeenCalledWith({
      targetUrl: 'https://example.com',
      instructions: 'Click the start button',
      repoUrl: 'https://github.com/org/repo',
      repoProvider: 'github',
      credentialsRef: 'my-secret',
    });
  });

  it('submit() sets run in store and navigates to /progress/:id on success', () => {
    runsApiSpy.createRun.and.returnValue(of({
      runId: 'run-001',
      status: RunStatus.Queued,
      targetUrl: 'https://example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    component.form.setValue(VALID_FORM);
    component.submit();

    expect(store.runId()).toBe('run-001');
    expect(store.status()).toBe(RunStatus.Queued);
    expect(router.navigate).toHaveBeenCalledWith(['/progress', 'run-001']);
  });

  it('submit() sets submitError on API failure', () => {
    runsApiSpy.createRun.and.returnValue(throwError(() => new Error('Server error')));

    component.form.setValue(VALID_FORM);
    component.submit();

    expect(component.submitError).toBe('Server error');
    expect(component.isSubmitting).toBeFalse();
  });

  it('submit() uses fallback message when error has no message', () => {
    runsApiSpy.createRun.and.returnValue(throwError(() => ({ message: undefined })));

    component.form.setValue(VALID_FORM);
    component.submit();

    expect(component.submitError).toBe('Failed to start BAIA');
  });

  it('shows submit-error element after API failure', () => {
    runsApiSpy.createRun.and.returnValue(throwError(() => new Error('Network failure')));

    component.form.setValue(VALID_FORM);
    component.submit();
    fixture.detectChanges();

    const errorEl: HTMLElement = fixture.nativeElement.querySelector('[data-testid="submit-error"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent?.trim()).toBe('Network failure');
  });

  it('submit() does not call createRun a second time while isSubmitting is true', () => {
    runsApiSpy.createRun.and.returnValue(of({
      runId: 'run-001',
      status: RunStatus.Queued,
      targetUrl: 'https://example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    component.form.setValue(VALID_FORM);
    component.isSubmitting = true;
    component.submit();

    expect(runsApiSpy.createRun).not.toHaveBeenCalled();
  });
});
