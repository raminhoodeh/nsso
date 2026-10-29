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
            window.busy=[];
            window.parsePayPal=parsePayPalInput;
            window.renderPayPal=props=>root.render(<PayPal {...props}/>);
            window.renderMany=props=>root.render(<>{props.map((p,i)=><PayPal key={i} {...p}/>)}</>);
            const editorProps={accountId:'22222222-2222-4222-8222-222222222222',getRevision:()=>0,onSavingChange:saving=>window.busy.push(saving),refreshRevision:async()=>{if(window.fixtureRevisionRefreshFailure)throw new Error('Fixture refresh failed');return !window.fixtureRevisionRefreshFalse},onSaved:async(html,config)=>{window.saved.push({html,config});if(window.fixtureRefreshFailure)throw new Error('Fixture profile refresh failed');return !window.fixtureRefreshFalse}};
            window.renderEditor=(html,id='11111111-1111-4111-8111-111111111111',options={})=>root.render(<Editor {...editorProps} productId={id} initialHtml={html} {...options}/>);
            function Sessions({html}){
                const [selected,select]=React.useState('one');
                const [expanded,expand]=React.useState(true);
                return <><button onClick={()=>select('one')}>Fixture offering one</button><button onClick={()=>select('two')}>Fixture offering two</button><button onClick={()=>select(null)}>Fixture back to offerings</button><button onClick={()=>expand(value=>!value)}>Fixture collapse section</button>{['one','two'].map(id=><div key={id} hidden={!expanded||selected!==id}><Editor {...editorProps} productId={id==='one'?'11111111-1111-4111-8111-111111111111':'33333333-3333-4333-8333-333333333333'} initialHtml={html} active={expanded&&selected===id}/></div>)}</>;
            }
            window.renderSessions=html=>root.render(<Sessions html={html}/>);
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
    await expect(page.getByRole('button', { name: 'Buy via PayPal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy Now', exact: true })).toHaveCount(0);
    expect(await page.evaluate(html => window.parsePayPal(html).config.label, ncp)).toBe('Buy Now');
    await expect(page.locator('input')).toHaveCount(0);
    expect(await page.evaluate(() => window.sdkLoaded || 0)).toBe(0);
});

test('unsupported named controls remain editable but cannot save or render a reinterpreted checkout', async ({ page }) => {
    await fixture(page);
    const named = ncp.replace('type="submit"', 'type="submit" name="merchant_choice"');
    await render(page, { html: named });
    await expect(page.getByText('Payment button unavailable. Please contact the seller.')).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
    await page.evaluate(html => window.renderEditor(html), ncp);
    const input = page.getByRole('textbox', { name: 'PayPal button code' });
    await input.fill(named); await input.blur();
    await expect(input).toHaveValue(named);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('status')).toContainText('Named submit or image controls are not supported');
    await expect(page.getByRole('button', { name: 'Save payment button' })).toBeDisabled();
    expect(await page.evaluate(() => window.saved)).toEqual([]);
});

test('a minimal committed payment receipt recovers the saved button without retaining raw source in the receipt', async ({ page }) => {
    let operation, writes = 0;
    await fixture(page, async route => {
        if (route.request().url().includes('/api/profile/operations?')) {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'applied', operationId: operation.operationId, revision: 1, changes: [] }) });
            return true;
        }
        if (!route.request().url().includes('/payment')) return false;
        operation = route.request().postDataJSON(); writes++;
        await route.abort('failed'); return true;
    });
    await page.evaluate(html => window.renderEditor(html), ncp);
    const input = page.getByRole('textbox', { name: 'PayPal button code' });
    await input.fill(ncp2); await page.getByRole('button', { name: 'Save payment button' }).click();
    await expect(page.getByRole('button', { name: 'Save payment button' })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.saved.length)).toBe(1);
    expect(writes).toBe(1);
    const saved = await page.evaluate(() => window.saved[0]);
    expect(saved.html).toBe(ncp2);
    expect(saved.config.action).toBe('https://www.paypal.com/ncp/payment/XY12CD34EF56G');
});

test('preview is inert and semantic URL rendering preserves invalid text without a clickable link', async ({ page }) => {
    await fixture(page);
    await render(page, { config: { version: 1, kind: 'hosted-button', hostedButtonId: 'FIXTUREGBP', currency: 'GBP' }, preview: true });
    await expect(page.getByText('Checkout is disabled during profile preview', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Buy via PayPal' }).press('Enter');
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview');
    await expect(page.getByRole('button', { name: 'Buy via PayPal' })).toHaveAttribute('aria-describedby', await page.getByRole('status').getAttribute('id'));
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
        if (route.request().url().includes('/api/profile/operations?')) { await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'not_found',operationId:new URL(route.request().url()).searchParams.get('operationId'),revision:0})});return true;}
        if (!route.request().url().includes('/payment')) return false;
        requests++;
        const { html, operationId } = route.request().postDataJSON();
        await route.fulfill({ status: requests === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1 ? { error: 'Payment settings were not saved. Your draft has been kept.' } : { success: true, status:'applied', operationId, revision:1, config: { version: 1, kind: 'payment-form', action: html.includes('XY12') ? 'https://www.paypal.com/ncp/payment/XY12CD34EF56G' : 'https://www.paypal.com/ncp/payment/AB12CD34EF56G', fields: [], label: 'Buy Now' } }) });
        return true;
    });
    await page.evaluate(html => window.renderEditor(html), ncp);
    const input = page.getByRole('textbox', { name: 'PayPal button code' });
    await input.fill('<script>bad()</script>');
    await input.blur();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toBe(0);
    await input.fill(ncp2);
    await page.getByRole('button', { name: 'Save payment button' }).click();
    await expect(page.getByRole('button', { name: 'Check status and retry' })).toBeEnabled();
    await expect(input).toHaveValue(ncp2);
    expect(await page.evaluate(() => window.saved)).toEqual([]);
    await page.getByRole('button', { name: 'Check status and retry' }).click();
    await expect(page.getByRole('button', { name: 'Save payment button' })).toBeDisabled();
    expect((await page.evaluate(() => window.saved)).map(saved => saved.html)).toEqual([ncp2]);
});

test('typing while a save is pending preserves newer draft and leaves another save available', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested;
    const requestedPromise = new Promise(resolve => { requested = resolve; });
    await fixture(page, async route => {
        if (route.request().url().includes('/api/profile/operations?')) { await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'not_found',operationId:new URL(route.request().url()).searchParams.get('operationId'),revision:0})});return true;}
        if (!route.request().url().includes('/payment')) return false;
        requested(); await gate;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, status:'applied', operationId, revision:1, config: { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/XY12CD34EF56G', fields: [], label: 'Buy Now' } }) }); return true;
    });
    await page.evaluate(html => window.renderEditor(html), ncp);
    const input = page.getByRole('textbox', { name: 'PayPal button code' });
    await input.fill(ncp2); await page.getByRole('button', { name: 'Save payment button' }).click(); await requestedPromise;
    const newer = ncp.replace('AB12CD34EF56G', 'ZZ12CD34EF56G');
    await input.fill(newer); release();
    await expect(page.getByRole('button', { name: 'Save payment button' })).toBeEnabled();
    await expect(input).toHaveValue(newer);
    expect((await page.evaluate(() => window.saved)).map(saved => saved.html)).toEqual([ncp2]);
    await expect(page.getByRole('status')).toContainText('Unsaved changes.');
});

test('valid payment code is saved explicitly, never by leaving its field or navigating away', async ({ page }) => {
    let writes = 0;
    await fixture(page, async route => {
        if (!route.request().url().includes('/payment')) return false;
        writes++;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'applied',operationId,revision:1})});
        return true;
    });
    await page.evaluate(html => window.renderSessions(html), ncp);
    const input=page.getByRole('textbox',{name:'PayPal button code'});
    await input.fill(ncp2); await input.blur();
    await expect(page.getByRole('status')).toContainText('Unsaved changes.');
    expect(writes).toBe(0);
    await page.getByRole('button',{name:'Fixture offering two',exact:true}).click();
    await expect(input).toHaveValue(ncp);
    await page.getByRole('button',{name:'Fixture offering one',exact:true}).click();
    await expect(input).toHaveValue(ncp2);
    await page.getByRole('button',{name:'Fixture back to offerings'}).click();
    await expect(input).toHaveCount(0);
    await page.getByRole('button',{name:'Fixture offering one',exact:true}).click();
    await expect(input).toHaveValue(ncp2);
    await page.getByRole('button',{name:'Fixture collapse section'}).click();
    await expect(input).toHaveCount(0);
    await page.getByRole('button',{name:'Fixture collapse section'}).click();
    await expect(input).toHaveValue(ncp2);
    expect(writes).toBe(0);
    await page.getByRole('button',{name:'Save payment button',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Payment button saved.');
    expect(writes).toBe(1);
});

test('an in-flight save completes while its stable offering editor is hidden', async ({ page }) => {
    let release, requested, writes=0;
    const gate=new Promise(resolve=>{release=resolve});
    const requestSeen=new Promise(resolve=>{requested=resolve});
    await fixture(page,async route=>{
        if(!route.request().url().includes('/payment'))return false;
        writes++; requested(); await gate;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'applied',operationId,revision:1})});
        return true;
    });
    await page.evaluate(html=>window.renderSessions(html),ncp);
    await page.getByRole('textbox',{name:'PayPal button code'}).fill(ncp2);
    await page.getByRole('button',{name:'Save payment button',exact:true}).click();
    await requestSeen;
    expect(await page.evaluate(()=>window.busy)).toEqual([true]);
    await page.getByRole('button',{name:'Fixture back to offerings'}).click();
    await page.getByRole('button',{name:'Fixture collapse section'}).click();
    release();
    await expect.poll(()=>page.evaluate(()=>window.saved.length)).toBe(1);
    await page.getByRole('button',{name:'Fixture collapse section'}).click();
    await page.getByRole('button',{name:'Fixture offering one',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'PayPal button code'})).toHaveValue(ncp2);
    await expect(page.getByRole('status')).toContainText('Payment button saved.');
    await expect(page.getByRole('button',{name:'Save payment button',exact:true})).toBeDisabled();
    expect(writes).toBe(1);
    expect(await page.evaluate(()=>window.busy)).toEqual([true,false]);
});

test('confirmed saves remain saved when profile refresh fails, without a duplicate write or stale prop rollback',async({page})=>{
    let writes=0;
    await fixture(page,async route=>{
        if(!route.request().url().includes('/payment'))return false;
        writes++;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'applied',operationId,revision:1})});
        return true;
    });
    await page.evaluate(html=>{window.fixtureRefreshFailure=true;window.renderEditor(html)},ncp);
    const input=page.getByRole('textbox',{name:'PayPal button code'});
    await input.fill(ncp2);
    await page.getByRole('button',{name:'Save payment button',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Payment button saved. The profile could not refresh');
    await expect(input).toHaveValue(ncp2);
    await expect(page.getByRole('button',{name:'Save payment button',exact:true})).toBeDisabled();
    await page.evaluate(html=>window.renderEditor(html),ncp);
    await expect(input).toHaveValue(ncp2);
    expect(writes).toBe(1);
});

test('external prop refresh preserves dirty code and switching account clears the prior account draft',async({page})=>{
    await fixture(page);
    await page.evaluate(html=>window.renderEditor(html),ncp);
    const input=page.getByRole('textbox',{name:'PayPal button code'});
    await input.fill(ncp2);
    const remote=ncp.replace('AB12CD34EF56G','ZZ12CD34EF56G');
    await page.evaluate(html=>window.renderEditor(html),remote);
    await expect(input).toHaveValue(ncp2);
    await page.evaluate(html=>window.renderEditor(html,undefined,{accountId:'44444444-4444-4444-8444-444444444444'}),remote);
    await expect(input).toHaveValue(remote);
    await expect(page.getByRole('button',{name:'Save payment button',exact:true})).toBeDisabled();
});

test('conflict refresh failures keep the draft and allow a deliberate review retry',async({page})=>{
    await fixture(page,async route=>{
        if(!route.request().url().includes('/payment'))return false;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({status:'conflict',operationId,revision:2})});
        return true;
    });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.evaluate(html=>{window.fixtureRevisionRefreshFailure=true;window.renderEditor(html)},ncp);
    const input=page.getByRole('textbox',{name:'PayPal button code'});
    await input.fill(ncp2);
    await page.getByRole('button',{name:'Save payment button',exact:true}).click();
    await page.getByRole('button',{name:'Refresh for review',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Could not load the latest settings. Your draft is kept.');
    await expect(input).toHaveValue(ncp2);
    await page.evaluate(()=>{window.fixtureRevisionRefreshFailure=false});
    await page.getByRole('button',{name:'Refresh for review',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Latest settings loaded. Review your draft');
    await expect(page.getByRole('button',{name:'Save payment button',exact:true})).toBeEnabled();
    expect(errors).toEqual([]);
});

test('an explicitly false provider refresh does not claim conflict settings were loaded',async({page})=>{
    let writes=0;
    await fixture(page,async route=>{
        if(!route.request().url().includes('/payment'))return false;
        writes++;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({status:409,json:{status:'conflict',operationId,revision:2}});return true;
    });
    await page.evaluate(html=>{window.fixtureRevisionRefreshFalse=true;window.renderEditor(html)},ncp);
    await page.getByRole('textbox',{name:'PayPal button code'}).fill(ncp2);
    await page.getByRole('button',{name:'Save payment button',exact:true}).click();
    await page.getByRole('button',{name:'Refresh for review',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Could not load the latest settings');
    await expect(page.getByRole('button',{name:'Refresh for review',exact:true})).toBeEnabled();
    expect(writes).toBe(1);
});

test('changing account cancels an older pending save and releases its busy state without applying it locally',async({page})=>{
    let release, requested;
    const gate=new Promise(resolve=>{release=resolve});
    const requestSeen=new Promise(resolve=>{requested=resolve});
    await fixture(page,async route=>{
        if(!route.request().url().includes('/payment'))return false;
        requested(); await gate;
        const {operationId}=route.request().postDataJSON();
        await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'applied',operationId,revision:1})}).catch(()=>{});
        return true;
    });
    await page.evaluate(html=>window.renderEditor(html),ncp);
    await page.getByRole('textbox',{name:'PayPal button code'}).fill(ncp2);
    await page.getByRole('button',{name:'Save payment button',exact:true}).click();
    await requestSeen;
    await page.evaluate(html=>window.renderEditor(html,undefined,{accountId:'44444444-4444-4444-8444-444444444444'}),ncp);
    release();
    await expect(page.getByRole('textbox',{name:'PayPal button code'})).toHaveValue(ncp);
    await expect(page.getByRole('button',{name:'Save payment button',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>window.saved)).toEqual([]);
    expect(await page.evaluate(()=>window.busy)).toEqual([true,false]);
});
