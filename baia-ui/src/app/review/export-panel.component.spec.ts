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
    runsApiSpy = jasmine.createSpyObj('RunsApiService', [
      'createRun',
      'getRun',
      'startRun',
      'export',
      'downloadGherkin',
      'downloadOkf',
    ]) as jasmine.SpyObj<RunsApiService>;

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
    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = 'ENG';
    component.credentialsRef = 'cred-ref';
    fixture.detectChanges();

    expect(component.canExport).toBeTrue();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="confluence-export-btn"]');
    expect(btn.disabled).toBeFalse();
  });

  it('success path: export() sets exportUrl, shows export-success and confluence-link', async () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = 'ENG';
    component.credentialsRef = 'cred-ref';
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

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = 'ENG';
    component.credentialsRef = 'cred-ref';
    runsApiSpy['export'].and.returnValue(throwError(() => new Error('Network error')));

    component.export();
    fixture.detectChanges();

    expect(component.exportError).toBe('Network error');
    expect(component.exportUrl).toBeNull();

    const errorEl: HTMLElement = fixture.nativeElement.querySelector('[data-testid="export-error"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent?.trim()).toBe('Network error');
  });

  it('disabled when baseUrl empty: approved but baseUrl="" → canExport false', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = '';
    component.spaceKey = 'ENG';
    component.credentialsRef = 'cred-ref';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('disabled when spaceKey empty: approved but spaceKey="" → canExport false', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = '';
    component.credentialsRef = 'cred-ref';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('disabled when credentialsRef empty: approved but credentialsRef="" → canExport false', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = 'ENG';
    component.credentialsRef = '';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('failure path: error without message falls back to "Export failed"', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = 'ENG';
    component.credentialsRef = 'cred-ref';
    runsApiSpy['export'].and.returnValue(throwError(() => ({ message: undefined })));

    component.export();
    fixture.detectChanges();

    expect(component.exportError).toBe('Export failed');
    expect(component.exportUrl).toBeNull();
    expect(component.isExporting).toBeFalse();
  });

  it('downloadGherkin success triggers browser download', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    const mockBlob = new Blob(['Gherkin doc'], { type: 'text/plain' });
    runsApiSpy.downloadGherkin.and.returnValue(of(mockBlob));

    spyOn(window.URL, 'createObjectURL').and.returnValue('blob-url');
    spyOn(window.URL, 'revokeObjectURL');
    const mockAnchor = document.createElement('a');
    spyOn(document, 'createElement').and.callThrough().and.returnValue(mockAnchor);
    spyOn(mockAnchor, 'click');

    component.downloadGherkin();

    expect(runsApiSpy.downloadGherkin).toHaveBeenCalledWith('test-run-id');
    expect(mockAnchor.download).toBe('test-run-id.feature');
    expect(mockAnchor.href).toContain('blob-url');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('downloadOkf success triggers browser download', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    runsApiSpy.downloadOkf.and.returnValue(of(mockBlob));

    spyOn(window.URL, 'createObjectURL').and.returnValue('zip-url');
    spyOn(window.URL, 'revokeObjectURL');
    const mockAnchor = document.createElement('a');
    spyOn(document, 'createElement').and.callThrough().and.returnValue(mockAnchor);
    spyOn(mockAnchor, 'click');

    component.downloadOkf();

    expect(runsApiSpy.downloadOkf).toHaveBeenCalledWith('test-run-id');
    expect(mockAnchor.download).toBe('test-run-id-okf.zip');
    expect(mockAnchor.href).toContain('zip-url');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('downloadGherkin error: non-Error thrown falls back to "Gherkin download failed"', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    runsApiSpy.downloadGherkin.and.returnValue(throwError(() => ({ noMessageField: true })));

    component.downloadGherkin();

    expect(component.exportError).toBe('Gherkin download failed');
  });

  it('downloadOkf error: non-Error thrown falls back to "OKF download failed"', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    runsApiSpy.downloadOkf.and.returnValue(throwError(() => ({ noMessageField: true })));

    component.downloadOkf();

    expect(component.exportError).toBe('OKF download failed');
  });

  it('canExport false when baseUrl is whitespace-only', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = '   ';
    component.spaceKey = 'ENG';
    component.credentialsRef = 'cred-ref';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('canExport false when spaceKey is whitespace-only', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = '   ';
    component.credentialsRef = 'cred-ref';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('canExport false when credentialsRef is whitespace-only', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();

    component.baseUrl = 'https://mycompany.atlassian.net';
    component.spaceKey = 'ENG';
    component.credentialsRef = '   ';
    fixture.detectChanges();

    expect(component.canExport).toBeFalse();
  });

  it('downloadGherkin uses "gherkin" fallback filename when runId is empty', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();
    component.runId = '';

    const mockBlob = new Blob(['Gherkin doc'], { type: 'text/plain' });
    runsApiSpy.downloadGherkin.and.returnValue(of(mockBlob));

    spyOn(window.URL, 'createObjectURL').and.returnValue('blob-url');
    spyOn(window.URL, 'revokeObjectURL');
    const mockAnchor = document.createElement('a');
    spyOn(document, 'createElement').and.callThrough().and.returnValue(mockAnchor);
    spyOn(mockAnchor, 'click');

    component.downloadGherkin();

    expect(mockAnchor.download).toBe('gherkin.feature');
  });

  it('downloadOkf uses "okf" fallback filename when runId is empty', () => {
    store.setStatus(RunStatus.Review);
    store.approve();
    createComponent();
    component.runId = '';

    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    runsApiSpy.downloadOkf.and.returnValue(of(mockBlob));

    spyOn(window.URL, 'createObjectURL').and.returnValue('zip-url');
    spyOn(window.URL, 'revokeObjectURL');
    const mockAnchor = document.createElement('a');
    spyOn(document, 'createElement').and.callThrough().and.returnValue(mockAnchor);
    spyOn(mockAnchor, 'click');

    component.downloadOkf();

    expect(mockAnchor.download).toBe('okf-okf.zip');
  });
});
