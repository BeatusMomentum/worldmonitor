import { test, expect, type Page } from '@playwright/test';
import { buildPluginShell } from '../api/mcp/ui/plugin-loader';

const origin = 'https://www.worldmonitor.app';
const headers = { 'Access-Control-Allow-Origin': '*' };
const currentHtml = (root: string, version: string) => `<!doctype html><html><head><link rel="stylesheet" href="/plugin/assets/current-${version}.css"></head><body><main id="${root}">Loading current panel</main><script type="module" src="/plugin/assets/current-${version}.js"></script><script src="https://static.cloudflareinsights.com/beacon.min.js"></script></body></html>`;

async function mount(page: Page, shell: string) {
  await page.setContent('<iframe title="WorldMonitor" sandbox="allow-scripts" style="width:100%;height:600px;border:0"></iframe>');
  await page.locator('iframe').evaluate((frame, html) => { (frame as HTMLIFrameElement).srcdoc = html; }, shell);
  return page.frameLocator('iframe');
}

for (const entry of ['country.html', 'plugin.html'] as const) {
  test(`cached ${entry} shell loads both current deployments under its CSP`, async ({ page }) => {
    const root = entry === 'country.html' ? 'countryRoot' : 'pluginRoot';
    const shell = buildPluginShell({ origin, entry, root }).replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${origin}; style-src 'unsafe-inline' ${origin}; connect-src ${origin}; base-uri ${origin}">`);
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    let version = 'A';
    await page.route(`${origin}/plugin/${entry}`, route => route.fulfill({ headers, contentType: 'text/html', body: currentHtml(root, version) }));
    await page.route(`${origin}/plugin/assets/**`, route => route.fulfill({ headers, contentType: route.request().url().endsWith('.css') ? 'text/css' : 'application/javascript', body: route.request().url().endsWith('.css') ? 'main{color:rgb(1,2,3)}' : `document.getElementById('${root}').textContent='Current ${version} panel';` }));
    const frame = await mount(page, shell);
    await expect(frame.locator('main')).toHaveText('Current A panel');
    version = 'B';
    await mount(page, shell);
    await expect(frame.locator('main')).toHaveText('Current B panel');
    await expect(frame.locator('main')).toHaveCSS('color', 'rgb(1, 2, 3)');
    expect(requests.some(url => url.includes('cloudflareinsights'))).toBe(false);
    expect(requests.some(url => url.includes('/mcp'))).toBe(false);
  });
}

for (const failure of ['document', 'module', 'style'] as const) {
  test(`${failure} failure recovers through retry even with the same asset filename`, async ({ page }, info) => {
    let failed = true;
    let documentReads = 0;
    await page.route(`${origin}/plugin/country.html`, route => {
      documentReads++;
      return route.fulfill({ headers, status: failed && failure === 'document' ? 503 : 200, contentType: 'text/html', body: currentHtml('countryRoot', 'same') });
    });
    await page.route(`${origin}/plugin/assets/**`, route => {
      const css = route.request().url().endsWith('.css');
      return route.fulfill({ headers, status: failed && ((failure === 'style' && css) || (failure === 'module' && !css)) ? 404 : 200, contentType: css ? 'text/css' : 'application/javascript', body: css ? 'main{padding:24px}' : "document.getElementById('countryRoot').textContent='Recovered current panel';" });
    });
    const frame = await mount(page, buildPluginShell({ origin, entry: 'country.html', root: 'countryRoot' }));
    await expect(frame.getByRole('status')).toContainText('could not load');
    if (failure === 'module') await page.screenshot({ path: info.outputPath('interface-failure.png') });
    failed = false;
    await frame.getByRole('button', { name: 'Retry interface' }).click();
    await expect(frame.locator('main')).toHaveText('Recovered current panel');
    expect(documentReads).toBe(2);
    if (failure === 'module') await page.screenshot({ path: info.outputPath('interface-recovered.png') });
  });
}

for (const [index, html] of [
  '<html><body>Sign in</body></html>',
  currentHtml('countryRoot', 'bad').replace('/plugin/assets/current-bad.js', 'https://example.com/foreign.js'),
  currentHtml('countryRoot', 'bad').replace('/plugin/assets/current-bad.css', 'https://example.com/foreign.css'),
  currentHtml('countryRoot', 'bad') + 'x'.repeat(131073),
].entries()) {
  test(`invalid document fails before loading scripts (${index})`, async ({ page }) => {
    const assets: string[] = [];
    page.on('request', request => { if (!request.url().endsWith('/country.html')) assets.push(request.url()); });
    await page.route(`${origin}/plugin/country.html`, route => route.fulfill({ headers, contentType: 'text/html', body: html }));
    const frame = await mount(page, buildPluginShell({ origin, entry: 'country.html', root: 'countryRoot' }));
    await expect(frame.getByRole('status')).toContainText('could not load');
    expect(assets).toEqual([]);
  });
}
