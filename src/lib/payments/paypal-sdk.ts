import type { PayPalCurrency } from './paypal-config'

export interface PayPalHostedSdk {
    HostedButtons: (options: { hostedButtonId: string }) => { render: (container: HTMLElement) => Promise<unknown> | void; close?: () => void }
}

const loads = new WeakMap<Document, Map<string, Promise<PayPalHostedSdk>>>()

/** Hosted checkout only. Price, recipient and delivery remain configured at PayPal. */
export function loadPayPalHostedSdk(currency: PayPalCurrency, environment: { window: Window; document: Document } = { window, document }): Promise<PayPalHostedSdk> {
    const { window: browser, document: dom } = environment
    const namespace = `nsso_paypal_hosted_${currency.toLowerCase()}`
    const key = `ba|hosted-buttons|${currency}|capture|${namespace}`
    let documentLoads = loads.get(dom)
    if (!documentLoads) {
        documentLoads = new Map()
        loads.set(dom, documentLoads)
    }
    const cached = documentLoads.get(key)
    if (cached) return cached
    const sdk = () => (browser as unknown as Record<string, PayPalHostedSdk | undefined>)[namespace]
    if (typeof sdk()?.HostedButtons === 'function') return Promise.resolve(sdk()!)

    const script = dom.createElement('script')
    const url = new URL('https://www.paypal.com/sdk/js')
    url.search = new URLSearchParams({ 'client-id': 'ba', components: 'hosted-buttons', currency, intent: 'capture' }).toString()
    script.src = url.href
    script.async = true
    const nonce = dom.querySelector<HTMLScriptElement>('script[nonce]')?.nonce
    if (nonce) { script.nonce = nonce; script.setAttribute('data-csp-nonce', nonce) }
    script.setAttribute('data-namespace', namespace)
    script.setAttribute('data-nsso-paypal-config', key)
    const promise = new Promise<PayPalHostedSdk>((resolve, reject) => {
        let finished = false
        const fail = () => {
            if (finished) return
            finished = true
            browser.clearTimeout(timeout)
            script.remove()
            documentLoads!.delete(key)
            reject(new Error('PayPal checkout could not be loaded.'))
        }
        const timeout = browser.setTimeout(fail, 10000)
        script.onerror = fail
        script.onload = () => {
            if (finished) return
            const loaded = sdk()
            if (typeof loaded?.HostedButtons !== 'function') return fail()
            finished = true
            browser.clearTimeout(timeout)
            resolve(loaded)
        }
        dom.body.appendChild(script)
    })
    documentLoads.set(key, promise)
    return promise
}
