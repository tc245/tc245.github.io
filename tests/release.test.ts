import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import rawRegister from '../src/data/records.json';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const approved = rawRegister.filter((record) => record.releaseApproved);
const unpublished = rawRegister.filter((record) => !record.releaseApproved);

async function builtFiles(directory = dist): Promise<string[]> {
  assert.ok(await stat(directory).catch(() => null), `Build output missing at ${directory}. Run npm run build before npm run test:unit.`);
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? builtFiles(filename) : Promise.resolve([filename]);
  }))).flat();
}

test('public build contains no unreleased fixture or internal release flag', async () => {
  assert.ok(unpublished.length > 0, 'The release-leak test requires an unpublished fixture in the source register.');
  const publicFiles = (await builtFiles()).filter((filename) => /\.(?:html|[cm]?js|json)$/i.test(filename));
  assert.ok(publicFiles.some((filename) => filename.endsWith('.js')), 'No built browser JavaScript found; check the build and release scan.');
  const forbidden = ['releaseApproved', 'UNRELEASED_FIXTURE_SENTINEL', ...unpublished.flatMap((record) => [record.id, record.title])];
  for (const filename of publicFiles) {
    const content = await readFile(filename, 'utf8');
    for (const value of forbidden) {
      assert.ok(!content.includes(value), `Public data leak: ${path.relative(dist, filename)} contains ${JSON.stringify(value)}. Check build-only imports and public projection.`);
    }
  }
});

test('public export and generated record/source routes contain exactly the 18 approved records', async () => {
  const files = await builtFiles();
  const exported = JSON.parse(await readFile(path.join(dist, 'data/evidence.json'), 'utf8'));
  assert.ok(Array.isArray(exported), 'dist/data/evidence.json must be an array of public records.');
  assert.equal(exported.length, 18, 'The public export must contain exactly 18 demonstration records.');
  const expectedIds = approved.map((record) => record.id).sort();
  assert.deepEqual(exported.map((record: { id: string }) => record.id).sort(), expectedIds, 'Export IDs differ from the approved register (or include duplicates).');
  assert.deepEqual(exported, approved.map(({ releaseApproved: _internal, ...record }) => record), 'Export must be the complete public projection with no internal fields.');
  for (const section of ['evidence', 'sources']) {
    const routes = files.map((filename) => path.relative(dist, filename).split(path.sep).join('/'))
      .filter((filename) => filename.startsWith(`${section}/`) && filename.endsWith('.html') && filename !== `${section}/index.html`);
    assert.deepEqual(routes.sort(), expectedIds.map((id) => `${section}/${id}/index.html`).sort(), `${section}: expected exactly one generated HTML page per approved record and no private routes.`);
  }
});

test('every generated HTML page clearly identifies the fictional concept demonstration', async () => {
  const htmlFiles = (await builtFiles()).filter((filename) => filename.endsWith('.html'));
  assert.ok(htmlFiles.length >= 41, 'Expected the main pages plus all 36 record/source pages; check static route generation.');
  for (const filename of htmlFiles) {
    const html = await readFile(filename, 'utf8');
    const label = path.relative(dist, filename);
    assert.match(html, /class="demo-banner"[^>]*>[\s\S]*?Concept demo[\s\S]*?All evidence records are fictional\./, `${label}: missing prominent fictional-demo banner.`);
    assert.match(html, /All records are fictional\. This is not an official website\./, `${label}: missing fictional/unofficial footer disclosure.`);
    if (label.startsWith(`evidence${path.sep}`) && label !== `evidence${path.sep}index.html`) {
      assert.match(html, /This is a fictional demonstration record\./, `${label}: missing record-specific fictional notice.`);
    }
    if (label.startsWith(`sources${path.sep}`)) {
      assert.match(html, /Demonstration material, not an original study\./, `${label}: source sheet could be mistaken for a real publication.`);
    }
  }
});

test('all executable production scripts stay external for the strict Caddy policy', async () => {
  const htmlFiles = (await builtFiles()).filter((filename) => filename.endsWith('.html'));
  for (const filename of htmlFiles) {
    const html = await readFile(filename, 'utf8');
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const [, attributes, body] = script;
      const isData = /\btype=["']application\/(?:ld\+)?json["']/i.test(attributes);
      if (isData) continue;
      assert.match(attributes, /\bsrc=["'][^"']+["']/i, `${path.relative(dist, filename)} contains executable inline code blocked by script-src 'self'.`);
      assert.equal(body.trim(), '', `${path.relative(dist, filename)} has an executable inline script body.`);
    }
  }
});
