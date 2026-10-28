import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = path.join(root, 'public/assets/nsso-logo.png');
const logoConsumers = [
    'src/components/layout/Header.tsx',
    'src/components/layout/DashboardSidebar.tsx',
    'src/components/auth/AuthPageShell.tsx',
    'src/app/set-password/page.tsx',
    'src/app/reset-password/page.tsx',
];

test('the shared silver wordmark retains its transparent canvas and intrinsic dimensions', async () => {
    const metadata = await sharp(logoPath).metadata();
    assert.equal(metadata.width, 458);
    assert.equal(metadata.height, 224);
    assert.equal(metadata.hasAlpha, true);
    const { data, info } = await sharp(logoPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = [0, info.width - 1, (info.height - 1) * info.width, info.height * info.width - 1];
    for (const pixel of corners) assert.equal(data[pixel * info.channels + 3], 0);
    let transparentPixels = 0;
    let opaqueWordmarkPixels = 0;
    let brightSilverPixels = 0;
    for (let offset = 3; offset < data.length; offset += info.channels) {
        if (data[offset] === 0) transparentPixels += 1;
        if (data[offset] >= 200) {
            opaqueWordmarkPixels += 1;
            const luminance = (data[offset - 3] + data[offset - 2] + data[offset - 1]) / 3;
            if (luminance > 160) brightSilverPixels += 1;
        }
    }
    assert.ok(transparentPixels > info.width * info.height * 0.3, 'Do not replace the wordmark with the opaque black-background presentation image.');
    assert.ok(opaqueWordmarkPixels > 0 && brightSilverPixels / opaqueWordmarkPixels > 0.5, 'Retain the supplied bright silver wordmark, not a flat black replacement.');
});

test('all shared wordmark consumers reserve the correct aspect ratio without stretching', () => {
    let count = 0;
    for (const filename of logoConsumers) {
        const source = ts.createSourceFile(filename, fs.readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const visit = (node) => {
            if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
                const attributes = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => [attribute.name.getText(source), attribute.initializer]));
                const src = attributes.get('src');
                if (src && ts.isStringLiteral(src) && src.text === '/assets/nsso-logo.png') {
                    count += 1;
                    assert.equal(attributes.get('alt')?.text, 'nsso', filename);
                    for (const [name, expected] of [['width', 458], ['height', 224]]) {
                        const initializer = attributes.get(name);
                        assert.ok(initializer && ts.isJsxExpression(initializer) && initializer.expression && ts.isNumericLiteral(initializer.expression), `${filename}: ${name}`);
                        assert.equal(Number(initializer.expression.text), expected, `${filename}: ${name}`);
                    }
                    assert.match(attributes.get('className')?.text ?? '', /\bw-auto\b/, filename);
                    assert.match(attributes.get('className')?.text ?? '', /\bh-(8|10)\b/, filename);
                    assert.doesNotMatch(attributes.get('className')?.text ?? '', /\b(?:brightness-0|invert(?:-[\w/]+)?)\b/, `${filename}: Preserve the silver wordmark rather than forcing a flat black logo.`);
                    if (filename.includes('AuthPageShell')) assert.doesNotMatch(attributes.get('className')?.text ?? '', /\bopacity-/, 'The authentication wordmark must retain its supplied opacity.');
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    assert.equal(count, 6, 'Cover the main Header, sidebar, shared auth shell, and password recovery logos; the light account menu uses its supplied dark wordmark.');
});

test('the light account menu preserves the supplied dark wordmark and clips only its transparent margins', async () => {
    const metadata = await sharp(path.join(root, 'public/assets/nsso-logo-dark.png')).metadata();
    assert.equal(metadata.width, 3840);
    assert.equal(metadata.height, 2172);
    assert.equal(metadata.hasAlpha, true);
    const { data, info } = await sharp(path.join(root, 'public/assets/nsso-logo-dark.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + 3] > 0) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
    }
    const glyphWidth = maxX - minX + 1, glyphHeight = maxY - minY + 1;
    assert.deepEqual({ minX, minY, glyphWidth, glyphHeight }, { minX: 892, minY: 566, glyphWidth: 2037, glyphHeight: 943 });

    const filename = 'src/components/layout/Header.tsx';
    const source = ts.createSourceFile(filename, fs.readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const attributesOf = node => new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(source), attribute.initializer]));
    const consumers = [];
    const visit = node => {
        if (ts.isJsxSelfClosingElement(node)) {
            const attributes = attributesOf(node);
            if (attributes.get('src')?.text === '/assets/nsso-logo-dark.png') consumers.push({ node, attributes });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(consumers.length, 1, 'Use the dark mark only in the light account-menu heading.');
    const { node, attributes } = consumers[0];
    assert.equal(attributes.get('alt')?.text, 'nsso');
    for (const [name, expected] of [['width', 3840], ['height', 2172]]) {
        const initializer = attributes.get(name);
        assert.ok(initializer && ts.isJsxExpression(initializer) && initializer.expression && ts.isNumericLiteral(initializer.expression), name);
        assert.equal(Number(initializer.expression.text), expected, name);
    }
    assert.ok(ts.isJsxElement(node.parent));
    const frame = attributesOf(node.parent.openingElement);
    assert.equal(frame.get('data-mobile-menu-logo')?.text, 'true');
    assert.match(frame.get('className')?.text ?? '', /h-8 w-\[69px\].*overflow-hidden/);
    assert.ok(Math.abs((69 / 32) / (glyphWidth / glyphHeight) - 1) < 0.0025, 'The visible frame must retain the glyph aspect ratio at its rounded CSS pixel size.');
    const classes = attributes.get('className')?.text ?? '';
    assert.match(classes, /\bmax-w-none\b/);
    assert.doesNotMatch(classes, /brightness-|invert|object-cover/, 'Preserve the supplied pixels; do not flatten or crop the visible glyph.');
    for (const [property, expected] of [['w', info.width / glyphWidth * 100], ['h', info.height / glyphHeight * 100], ['left', -minX / glyphWidth * 100], ['top', -minY / glyphHeight * 100]]) {
        const value = classes.match(new RegExp(`(?:^| )${property}-\\[(-?[\\d.]+)%\\]`));
        assert.ok(value, `Missing ${property} framing percentage`);
        assert.ok(Math.abs(Number(value[1]) - expected) < 0.01, `${property} must align the visible glyph with the clipped frame.`);
    }
});
