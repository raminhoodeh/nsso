import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ncp = '<form action="https://www.paypal.com/ncp/payment/AB12CD34EF56G" method="post"><input type="submit" value="Buy Now"><img src="https://www.paypalobjects.com/images/Debit_Credit.svg" alt="cards"></form>';
const ncp2 = ncp.replace('AB12CD34EF56G', 'XY12CD34EF56G');
let bundle;
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';
            import {createRoot} from 'react-dom/client';
            import PayPal from './src/components/ui/PayPalSmartButton';
            import Editor from './src/components/payments/PayPalCodeEditor';
            import SafeExternalLink from './src/components/ui/SafeExternalLink';
            import {parsePayPalInput} from './src/lib/payments/paypal-config';
            const root=createRoot(document.getElementById('root'));
            window.saved=[];
            window.parsePayPal=parsePayPalInput;
            window.renderPayPal=props=>root.render(<PayPal {...props}/>);
            window.renderMany=props=>root.render(<>{props.map((p,i)=><PayPal key={i} {...p}/>)}</>);
            window.renderEditor=(html,id='11111111-1111-4111-8111-111111111111')=>root.render(<Editor productId={id} initialHtml={html} onSaved={(html,config)=>window.saved.push({html,config})}/>);
            window.renderLink=href=>root.render(<SafeExternalLink href={href}>Portfolio</SafeExternalLink>);
            window.clear=()=>root.render(null);
        ` },
    });
    bundle = result.outputFiles[0].text;
});

const sdkScript = `(()=>{const n=document.currentScript.dataset.namespace;window.sdkLoaded=(window.sdkLoaded||0)+1;window[n]={HostedButtons:({hostedButtonId})=>({render:async c=>{window.sdkRenders=(window.sdkRenders||0)+1;const b=document.createElement('button');b.textContent='Hosted '+hostedButtonId;c.append(b)},close:()=>{window.sdkClosed=(window.sdkClosed||0)+1}})}})();`;
async function fixture(page, override) {
    await page.route('**/*', async route => {
        const url = route.request().url();
        if (url === 'https://nsso.test/fixture') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
        if (override && await override(route)) return;
        if (url.startsWith('https://www.paypal.com/sdk/js')) return route.fulfill({ contentType: 'application/javascript', body: sdkScript });
        throw new Error(`Unexpected external request in isolated fixture: ${url}`);
    });
    await page.goto('https://nsso.test/fixture');
    await page.addScriptTag({ content: bundle });
}
const render = (page, props) => page.evaluate(props => window.renderPayPal(props), props);

test('malicious stored HTML cannot execute, create unsafe DOM, or contact its destinations', async ({ page }) => {
    await fixture(page);
    await render(page, { html: ncp + '<img src="https://attacker.invalid/tracker" onerror="window.fixturePwned=1"><script>window.fixturePwned=2</script>' });
    await expect(page.getByText('Payment button unavailable. Please contact the seller.')).toBeVisible();
    expect(await page.evaluate(() => window.fixturePwned)).toBeUndefined();
    await expect(page.locator('form,img,iframe')).toHaveCount(0);
    expect(await page.evaluate(() => window.sdkLoaded || 0)).toBe(0);
});

test('NCP checkout stays a native provider form even when obsolete price and success props are supplied', async ({ page }) => {
    await fixture(page);
    await render(page, { html: ncp, isPlatformOwner: true, price: 'USD 999', productName: 'Fixture', successUrl: 'https://attacker.invalid/file' });
    await expect(page.locator('form')).toHaveAttribute('action', 'https://www.paypal.com/ncp/payment/AB12CD34EF56G');
    await expect(page.locator('form')).toHaveAttribute('method', 'post');
    await expect(page.getByRole('button', { name: 'Buy Now' })).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    expect(await page.evaluate(() => window.sdkLoaded || 0)).toBe(0);
});

test('preview is inert and semantic URL rendering preserves invalid text without a clickable link', async ({ page }) => {
    await fixture(page);
    await render(page, { config: { version: 1, kind: 'hosted-button', hostedButtonId: 'FIXTUREGBP', currency: 'GBP' }, preview: true });
    await expect(page.getByRole('button', { name: 'Pay with PayPal' })).toBeDisabled();
    await expect(page.locator('form')).toHaveCount(0);
    expect(await page.evaluate(() => window.sdkLoaded || 0)).toBe(0);
    await page.evaluate(() => window.renderLink('javascript:window.fixturePwned=1'));
    await expect(page.getByText('Portfolio')).toBeVisible();
    await expect(page.getByRole('link')).toHaveCount(0);
    await page.evaluate(() => window.renderLink('https://example.test/portfolio'));
    await expect(page.getByRole('link')).toHaveAttribute('href', 'https://example.test/portfolio');
    await expect(page.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
});

test('hosted SDK instances are shared only for matching configuration, and clean up on unmount', async ({ page }) => {
    const loads = [];
    await fixture(page, async route => {
        if (!route.request().url().startsWith('https://www.paypal.com/sdk/js')) return false;
        loads.push(new URL(route.request().url()).searchParams.get('currency'));
        await route.fulfill({ contentType: 'application/javascript', body: sdkScript }); return true;
    });
    await page.evaluate(() => window.renderMany([
        {config:{version:1,kind:'hosted-button',hostedButtonId:'FIXTUREGBP1',currency:'GBP'}},
        {config:{version:1,kind:'hosted-button',hostedButtonId:'FIXTUREGBP2',currency:'GBP'}},
        {config:{version:1,kind:'hosted-button',hostedButtonId:'FIXTUREUSD',currency:'USD'}},
    ]));
    await expect(page.getByRole('button', { name: /^Hosted / })).toHaveCount(3);
    expect(loads.sort()).toEqual(['GBP', 'USD']);
    await page.evaluate(() => window.clear());
    await page.waitForFunction(() => window.sdkClosed === 3);
    await expect(page.locator('#root')).toBeEmpty();
});

test('missing SDK capability produces a retry that loads a fresh script', async ({ page }) => {
    let loads = 0;
    await fixture(page, async route => {
        if (!route.request().url().startsWith('https://www.paypal.com/sdk/js')) return false;
        loads++;
        await route.fulfill({ contentType: 'application/javascript', body: loads === 1 ? 'window.fixtureWrongSdk={Buttons(){}}' : sdkScript }); return true;
    });
    await render(page, { config: { version: 1, kind: 'hosted-button', hostedButtonId: 'FIXTUREGBP', currency: 'GBP' } });
    await page.getByRole('button', { name: 'Retry PayPal' }).click();
    await expect(page.getByRole('button', { name: 'Hosted FIXTUREGBP' })).toBeVisible();
    expect(loads).toBe(2);
});

test('unmount during SDK loading prevents rendering into a removed component', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested;
    const requestedPromise = new Promise(resolve => { requested = resolve; });
    await fixture(page, async route => {
        if (!route.request().url().startsWith('https://www.paypal.com/sdk/js')) return false;
        requested(); await gate;
        await route.fulfill({ contentType: 'application/javascript', body: sdkScript }); return true;
    });
    await render(page, { config: { version: 1, kind: 'hosted-button', hostedButtonId: 'FIXTUREGBP', currency: 'GBP' } });
    await requestedPromise;
    await page.evaluate(() => window.clear());
    await expect(page.locator('#root')).toBeEmpty();
    release();
    await page.waitForFunction(() => window.sdkLoaded === 1);
    expect(await page.evaluate(() => window.sdkRenders || 0)).toBe(0);
});

test('invalid editor drafts never persist, failed saves retain draft and last saved state, retry succeeds', async ({ page }) => {
    let requests = 0;
    await fixture(page, async route => {
        if (!route.request().url().includes('/payment')) return false;
        requests++;
        const { html } = route.request().postDataJSON();
        await route.fulfill({ status: requests === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1 ? { error: 'Payment settings were not saved. Your draft has been kept.' } : { success: true, config: { version: 1, kind: 'payment-form', action: html.includes('XY12') ? 'https://www.paypal.com/ncp/payment/XY12CD34EF56G' : 'https://www.paypal.com/ncp/payment/AB12CD34EF56G', fields: [], label: 'Buy Now' } }) });
        return true;
    });
    await page.evaluate(html => window.renderEditor(html), ncp);
    const input = page.getByRole('textbox', { name: 'PayPal button code' });
    await input.fill('<script>bad()</script>');
    await input.blur();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toBe(0);
    await input.fill(ncp2);
    await input.blur();
    await expect(page.getByRole('button', { name: 'Retry save' })).toBeEnabled();
    await expect(input).toHaveValue(ncp2);
    expect(await page.evaluate(() => window.saved)).toEqual([]);
    await page.getByRole('button', { name: 'Retry save' }).click();
    await expect(page.getByRole('button', { name: 'Save payment button' })).toBeDisabled();
    expect((await page.evaluate(() => window.saved)).map(saved => saved.html)).toEqual([ncp2]);
});

test('typing while a save is pending preserves newer draft and leaves another save available', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested;
    const requestedPromise = new Promise(resolve => { requested = resolve; });
    await fixture(page, async route => {
        if (!route.request().url().includes('/payment')) return false;
        requested(); await gate;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, config: { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/XY12CD34EF56G', fields: [], label: 'Buy Now' } }) }); return true;
    });
    await page.evaluate(html => window.renderEditor(html), ncp);
    const input = page.getByRole('textbox', { name: 'PayPal button code' });
    await input.fill(ncp2); await input.blur(); await requestedPromise;
    const newer = ncp.replace('AB12CD34EF56G', 'ZZ12CD34EF56G');
    await input.fill(newer); release();
    await expect(page.getByRole('button', { name: 'Save payment button' })).toBeEnabled();
    await expect(input).toHaveValue(newer);
    expect((await page.evaluate(() => window.saved)).map(saved => saved.html)).toEqual([ncp2]);
    await expect(page.getByRole('status')).toContainText('Unsaved changes.');
});
