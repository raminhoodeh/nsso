import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'parse5'

/** Check delivered HTML, rather than trusting a config flag or a CSS manifest. */
export function inspectHomepageCriticalCss(html) {
    const document = parse(html, { sourceCodeLocationInfo: true })
    const styles = [], blockingLinks = [], headings = []
    const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value
    const text = node => (node.childNodes || []).map(child => child.value || '').join('')
    const appliesToScreen = node => !['print', 'not all'].includes((attribute(node, 'media') || '').trim().toLowerCase())
    function visit(node) {
        if (node.tagName === 'style' && attribute(node, 'data-precedence') === 'next' && appliesToScreen(node)) {
            const hrefs = (attribute(node, 'data-href') || '').split(/\s+/).filter(Boolean)
            if (hrefs.some(href => /\/_next\/static\/[^\s]+\.css(?:[?#][^\s]*)?$/.test(href))) styles.push(node)
        }
        if (node.tagName === 'link') {
            const relations = (attribute(node, 'rel') || '').toLowerCase().split(/\s+/)
            if (relations.includes('stylesheet') && !relations.includes('alternate') && attribute(node, 'href')
                && attribute(node, 'disabled') === undefined && appliesToScreen(node)) blockingLinks.push(node)
        }
        if (node.tagName === 'h1' && node.sourceCodeLocation) headings.push(node)
        for (const child of node.childNodes || []) visit(child)
    }
    visit(document)
    if (blockingLinks.length) throw new Error('Homepage contains an external render-blocking stylesheet; refusing a first-paint regression')
    if (!styles.length) throw new Error('Homepage has no Next-managed inline stylesheet; refusing a first-paint regression')
    const heading = headings[0]
    if (!heading) throw new Error('Homepage has no server-rendered main heading; critical CSS ordering cannot be verified')
    // Next may stream styles into the body. Their source position, rather than
    // a head-only selector or the parsed tree order, determines availability.
    const earlyStyles = styles.filter(node => node.sourceCodeLocation?.endOffset <= heading.sourceCodeLocation.startOffset)
    const css = earlyStyles.map(text).join('\n')
    if (!/--nsso-bg-primary\s*:/.test(css) || !/\.text-5xl\s*[{,]/.test(css)) {
        throw new Error('Homepage nsso/Tailwind styles are missing before its main heading; refusing an unstyled first paint')
    }
    return { inlineStylesheets: earlyStyles.length, cssBytes: Buffer.byteLength(css), cssPrecedesMainHeading: true, renderBlockingStylesheets: 0 }
}

/** Reuse the CSP extractor's served-route inventory for Next and Vercel output. */
export async function verifyHomepageCriticalCss(repo, proof) {
    const artifacts = proof.artifacts.filter(artifact => artifact.routes.includes('/'))
    if (!proof.expectedRoutes.includes('/') || !artifacts.length) throw new Error('Served homepage artifact is missing; critical CSS verification failed')
    const verified = []
    for (const artifact of artifacts) {
        const result = inspectHomepageCriticalCss(await readFile(resolve(repo, artifact.file), 'utf8'))
        verified.push({ kind: artifact.kind, file: artifact.file, ...result })
    }
    return { version: 1, route: '/', output: proof.output, artifacts: verified }
}
