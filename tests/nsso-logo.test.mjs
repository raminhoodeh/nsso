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
    assert.equal(count, 6, 'Cover every Header, sidebar, shared auth shell, and password recovery logo.');
});
