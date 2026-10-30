import {readFile} from 'node:fs/promises';
import {test, expect} from '@playwright/test';

// Fictional values only. These configurations are compared, never executed.
const canary = 'PUBLIC_TEST_CANARY_DO_NOT_USE';
const fixtures = [
  {
    name: 'Claude allow addition',
    format: 'claude-settings',
    before: {permissions: {allow: ['Read(./docs/**)']}},
    after: {permissions: {allow: ['Read(./docs/**)', `Bash(${canary})`]}},
    codes: ['ALLOW_ADDED'],
  },
  {
    name: 'MCP environment change',
    format: 'mcp',
    before: {mcpServers: {fictional: {command: 'not-executed', env: {SETTING: 'before'}}}},
    after: {mcpServers: {fictional: {command: 'not-executed', env: {[canary]: canary}}}},
    codes: ['ENVIRONMENT_CHANGED'],
  },
];

async function compareInBrowser(page, language, fixture) {
  await page.goto('/');
  if (language === 'ar') await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.locator('html')).toHaveCSS('direction', language === 'ar' ? 'rtl' : 'ltr');
  await page.locator('#format').selectOption(fixture.format);
  await page.locator('#before').fill(JSON.stringify(fixture.before, null, 2));
  await page.locator('#after').fill(JSON.stringify(fixture.after, null, 2));
  await page.locator('#compare').click();
  await expect(page.locator('#findings .finding')).toHaveCount(fixture.codes.length);
  for (const code of fixture.codes) await expect(page.locator('#findings')).toContainText(code);
}

function checkReport(text, format, fixture) {
  expect(text).not.toContain(canary);
  if (format === 'md') {
    expect(text).toContain('# MONNA Agent Permission Diff');
    expect(text).toContain(`· ${fixture.format} · ${fixture.codes.length} findings`);
    for (const code of fixture.codes) expect(text).toContain(`| ${code} |`);
    expect(text).toContain('Coverage: supported_fields_only.');
  } else {
    const report = JSON.parse(text);
    expect(report.version).toBe('2.1.0');
    expect(report.runs).toHaveLength(1);
    const run = report.runs[0];
    expect(run.tool.driver.name).toBe('MONNA Agent Permission Diff');
    expect(run.tool.driver.rules.map(rule => rule.id)).toEqual(fixture.codes);
    expect(run.results.map(result => result.ruleId)).toEqual(fixture.codes);
    for (const result of run.results) {
      const after = result.locations[0].physicalLocation;
      const before = result.relatedLocations[0].physicalLocation;
      expect(after.artifactLocation.uri).toBe('after.json');
      expect(before.artifactLocation.uri).toBe('before.json');
      expect(after.region.startLine).toBeGreaterThan(0);
      expect(before.region.startLine).toBeGreaterThan(0);
    }
  }
}

for (const language of ['en', 'ar']) {
  for (const fixture of fixtures) {
    test(`${language}: completed Markdown and SARIF downloads for ${fixture.name}`, async ({page}, testInfo) => {
      await compareInBrowser(page, language, fixture);
      for (const format of ['md', 'sarif']) {
        const pending = page.waitForEvent('download');
        await page.locator(`#${format}`).click();
        const download = await pending;
        expect(download.suggestedFilename()).toBe(`monna-permission-diff.${format}`);
        const path = testInfo.outputPath(download.suggestedFilename());
        // saveAs waits for completion: a click, filename or Blob URL is not proof of bytes.
        await download.saveAs(path);
        expect(await download.failure()).toBeNull();
        const bytes = await readFile(path);
        expect(bytes.length).toBeGreaterThan(0);
        const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        checkReport(text, format, fixture);
        await expect(page.locator('#exportPreview')).toBeVisible();
        await expect(page.locator('#exportText')).toHaveValue(text);
      }
    });
  }
}

test.describe('copyable text when browser downloads are refused', () => {
  test.use({acceptDownloads: false});
  for (const language of ['en', 'ar']) {
    test(`${language}: both reports remain copyable after a refused download`, async ({page}) => {
      const fixture = fixtures[1];
      await compareInBrowser(page, language, fixture);
      for (const format of ['md', 'sarif']) {
        const pending = page.waitForEvent('download');
        await page.locator(`#${format}`).click();
        const download = await pending;
        expect(await download.failure()).not.toBeNull();
        await expect(page.locator('#exportPreview')).toBeVisible();
        await expect(page.locator('#exportText')).toHaveAttribute('readonly', '');
        checkReport(await page.locator('#exportText').inputValue(), format, fixture);
      }
    });
  }
});
