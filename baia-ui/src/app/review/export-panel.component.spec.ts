import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { ExportPanelComponent } from './export-panel.component';
import { RunStore } from '../core/state/run.store';
import { RunsApiService } from '../core/api/runs-api.service';
import { RunStatus } from '@baia/shared';

describe('ExportPanelComponent', () => {
  let fixture: ComponentFixture<ExportPanelComponent>;
  let component: ExportPanelComponent;
  let store: InstanceType<typeof RunStore>;
  let runsApiSpy: jasmine.SpyObj<RunsApiService>;

  beforeEach(async () => {
    runsApiSpy = jasmine.createSpyObj<RunsApiService>('RunsApiService', ['createRun', 'getRun', 'export']);

    await TestBed.configureTestingModule({
      imports: [ExportPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RunsApiService, useValue: runsApiSpy },
      ],
    }).compileComponents();

    store = TestBed.inject(RunStore);
    store.reset();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(ExportPanelComponent);
    component = fixture.componentInstance;
    component.runId = 'test-run-id';
    fixture.detectChanges();
  }

  it('disabled pre-approval: export button is disabled and canExport is false', () => {
    store.setStatus(RunStatus.Review);
    createComponent();

    expect(component.canExport).toBeFalse();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="confluence-export-btn"]');
    expect(btn.disabled).toBeTrue();
  });

  it('enabled after approval with inputs: canExport true, button not disabled', () => {
    store.setStatus(RunStatus.Review);
    createComponent();

    store.approve();
    component.spaceKey = 'ENG';
    component.title = 'My Page';
    fixture.detectChanges();

    expect(component.canExport).toBeTrue();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="confluence-export-btn"]');
    expect(btn.disabled).toBeFalse();
  });

  it('success path: export() sets exportUrl, shows export-success and confluence-link', async () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.spaceKey = 'ENG';
    component.title = 'My Page';
    const confluenceUrl = 'https://confluence.example.com/ENG/My+Page';
    runsApiSpy['export'].and.returnValue(of({ url: confluenceUrl }));

    component.export();
    fixture.detectChanges();

    expect(component.exportUrl).toBe(confluenceUrl);

    const successEl: HTMLElement = fixture.nativeElement.querySelector('[data-testid="export-success"]');
    expect(successEl).toBeTruthy();

    const linkEl: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-testid="confluence-link"]');
    expect(linkEl).toBeTruthy();
    expect(linkEl.getAttribute('href')).toBe(confluenceUrl);
  });

  it('failure path: API error sets exportError, shows export-error', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.spaceKey = 'ENG';
    component.title = 'My Page';
    runsApiSpy['export'].and.returnValue(throwError(() => new Error('Network error')));

    component.export();
    fixture.detectChanges();

    expect(component.exportError).toBe('Network error');
    expect(component.exportUrl).toBeNull();

    const errorEl: HTMLElement = fixture.nativeElement.querySelector('[data-testid="export-error"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent?.trim()).toBe('Network error');
  });

  it('disabled when spaceKey empty: approved but spaceKey="" → canExport false', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.spaceKey = '';
    component.title = 'My Page';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('disabled when title empty: approved but title="" → canExport false', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.spaceKey = 'ENG';
    component.title = '';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });
});
