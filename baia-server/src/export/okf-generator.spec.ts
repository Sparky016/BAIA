import { GherkinDoc } from '@baia/shared';
import AdmZip from 'adm-zip';
import {
  toSafeFilename,
  renderGherkinStep,
  gherkinFeatureToText,
  gherkinDocToText,
  gherkinFeatureToOkfMarkdown,
  generateOkfIndex,
  gherkinDocToOkfZip,
} from './okf-generator';

const SAMPLE_DOC: GherkinDoc = {
  features: [
    {
      name: 'User Login & Auth',
      description: 'As a user, I want to login.',
      scenarios: [
        {
          name: 'Successful login',
          steps: [
            { keyword: 'Given', text: 'the login page is open', provenance: 'ui' },
            { keyword: 'When', text: 'valid credentials are entered', provenance: 'ui' },
            { keyword: 'Then', text: 'the dashboard is displayed', provenance: 'ui' },
          ],
        },
        {
          name: 'Conflict scenario',
          steps: [
            { keyword: 'Given', text: 'the login page is open', provenance: 'ui' },
          ],
          conflictNote: 'Conflict detected with business rule 42',
        },
      ],
    },
  ],
  generatedAt: new Date('2025-01-15T10:00:00.000Z'),
};

describe('okf-generator', () => {
  describe('toSafeFilename', () => {
    it('normalizes string to safe kebab-case filename', () => {
      expect(toSafeFilename('User Login & Auth')).toBe('user-login-auth');
      expect(toSafeFilename('  hello   world  ')).toBe('hello-world');
      expect(toSafeFilename('!!!')).toBe('unnamed-feature');
    });
  });

  describe('renderGherkinStep', () => {
    it('concatenates keyword and text', () => {
      expect(renderGherkinStep({ keyword: 'Given', text: 'login page', provenance: 'ui' })).toBe('Given login page');
    });
  });

  describe('gherkinFeatureToText', () => {
    it('formats a feature to standard Gherkin syntax text', () => {
      const gherkinText = gherkinFeatureToText(SAMPLE_DOC.features[0]);
      expect(gherkinText).toContain('Feature: User Login & Auth');
      expect(gherkinText).toContain('  As a user, I want to login.');
      expect(gherkinText).toContain('  Scenario: Successful login');
      expect(gherkinText).toContain('    Given the login page is open');
    });
  });

  describe('gherkinDocToText', () => {
    it('joins multiple features', () => {
      const gherkinText = gherkinDocToText(SAMPLE_DOC);
      expect(gherkinText).toContain('Feature: User Login & Auth');
    });
  });

  describe('gherkinFeatureToOkfMarkdown', () => {
    it('creates OKF Markdown with YAML frontmatter', () => {
      const md = gherkinFeatureToOkfMarkdown(SAMPLE_DOC.features[0], SAMPLE_DOC, 'https://example.com/target');
      expect(md).toContain('---');
      expect(md).toContain('type: Feature');
      expect(md).toContain('title: "User Login & Auth"');
      expect(md).toContain('description: "As a user, I want to login."');
      expect(md).toContain('resource: "https://example.com/target"');
      expect(md).toContain('timestamp: "2025-01-15T10:00:00.000Z"');
      expect(md).toContain('---');
      expect(md).toContain('# User Login & Auth');
      expect(md).toContain('As a user, I want to login.');
      expect(md).toContain('## Scenarios');
      expect(md).toContain('### Successful login');
      expect(md).toContain('### Conflict scenario');
      expect(md).toContain('> [!WARNING]');
      expect(md).toContain('> **Reconciliation Warning**: Conflict detected with business rule 42');
    });
  });

  describe('generateOkfIndex', () => {
    it('generates system index Markdown', () => {
      const md = generateOkfIndex(SAMPLE_DOC);
      expect(md).toContain('type: System');
      expect(md).toContain('title: BAIA Generated Documentation');
      expect(md).toContain('- **[User Login & Auth](features/user-login-auth.md)** (Gherkin source: [user-login-auth.feature](features/user-login-auth.feature))');
    });
  });

  describe('gherkinDocToOkfZip', () => {
    it('packs index, md, and feature files into a ZIP buffer', () => {
      const zipBuffer = gherkinDocToOkfZip(SAMPLE_DOC, 'https://example.com/target');
      expect(zipBuffer).toBeInstanceOf(Buffer);

      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries().map(e => e.entryName);
      expect(entries).toContain('index.md');
      expect(entries).toContain('features/user-login-auth.md');
      expect(entries).toContain('features/user-login-auth.feature');

      const indexContent = zip.readAsText('index.md');
      expect(indexContent).toContain('type: System');

      const mdContent = zip.readAsText('features/user-login-auth.md');
      expect(mdContent).toContain('type: Feature');

      const featureContent = zip.readAsText('features/user-login-auth.feature');
      expect(featureContent).toContain('Feature: User Login & Auth');
    });
  });
});
