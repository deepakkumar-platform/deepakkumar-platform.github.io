// Writing studio: a local-only editor for src/content/posts, with a Publish button
// that builds the site and pushes to GitHub. GitHub Actions then deploys it to Pages.
// Run: npm run studio  → http://localhost:4322
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = join(ROOT, 'src/content/posts');
const IMAGES = join(ROOT, 'public/images');
const PORT = Number(process.env.STUDIO_PORT || 4322);
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const run = (cmd, args, timeout = 180_000) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout, maxBuffer: 10 << 20 }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err?.code ?? 0, out: `${stdout}${stderr}`.trim() }));
  });

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  const get = (k) => m?.[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '');
  return { title: get('title') ?? '(untitled)', date: get('date') ?? '', draft: get('draft') === 'true' };
}

async function listPosts() {
  const files = (await readdir(POSTS)).filter((f) => /\.mdx?$/.test(f));
  const posts = await Promise.all(files.map(async (f) => ({
    file: f, slug: f.replace(/\.mdx?$/, ''), ...frontmatter(await readFile(join(POSTS, f), 'utf8')),
  })));
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

async function postPath(slug) {
  if (!SLUG.test(slug)) throw Object.assign(new Error('Slugs use lowercase letters, numbers and hyphens only.'), { status: 400 });
  for (const ext of ['.md', '.mdx']) {
    const p = join(POSTS, slug + ext);
    if (await stat(p).then(() => true, () => false)) return p;
  }
  return join(POSTS, slug + '.md');
}

async function body(req, limit = 15 << 20) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Too large'), { status: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function publish(message) {
  const steps = [];
  const step = async (label, cmd, args) => { const r = await run(cmd, args); steps.push({ label, ...r }); return r.ok; };
  if (!(await step('Build the site (catches broken posts before they go live)', 'npx', ['astro', 'build']))) return { ok: false, steps };
  await step('Stage posts and images', 'git', ['add', 'src/content', 'public']);
  const staged = await run('git', ['diff', '--cached', '--quiet']);
  if (staged.ok) {
    steps.push({ label: 'Commit', ok: true, out: 'Nothing new to commit. Pushing any earlier commits.' });
  } else if (!(await step('Commit', 'git', ['commit', '-m', message || 'Update posts']))) return { ok: false, steps };
  const ok = await step('Push to GitHub', 'git', ['push', '-u', 'origin', 'HEAD']);
  return { ok, steps };
}

const server = createServer(async (req, res) => {
  try {
    // Local only: refuse other hosts (DNS rebinding) and cross-site writes (custom header forces a CORS preflight we never answer).
    if (!HOSTS.has(req.headers.host ?? '')) return send(res, 403, { error: 'Studio only answers on localhost.' });
    if (req.method !== 'GET' && req.headers['x-studio'] !== '1') return send(res, 403, { error: 'Missing studio header.' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const [, api, name, ...rest] = url.pathname.split('/');

    if (api === 'api' && name === 'posts' && !rest.length && req.method === 'GET') return send(res, 200, await listPosts());

    if (api === 'api' && name === 'posts' && rest.length === 1) {
      const p = await postPath(rest[0]);
      if (req.method === 'GET') return send(res, 200, { slug: rest[0], file: p.split('/').pop(), content: await readFile(p, 'utf8') });
      if (req.method === 'PUT') {
        const { content, create } = await body(req);
        const exists = await stat(p).then(() => true, () => false);
        if (create && exists) return send(res, 409, { error: `A post called "${rest[0]}" already exists. Pick another title.` });
        await writeFile(p, content);
        return send(res, 200, { saved: true, file: p.split('/').pop() });
      }
    }

    if (api === 'api' && name === 'upload' && req.method === 'POST') {
      const { slug, filename, data } = await body(req);
      if (!SLUG.test(slug)) return send(res, 400, { error: 'Save the post before adding images.' });
      const ext = extname(filename || '').toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return send(res, 400, { error: 'Images must be PNG, JPG, GIF, WebP or SVG.' });
      const base = (filename.slice(0, -ext.length).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image') + ext;
      await mkdir(join(IMAGES, slug), { recursive: true });
      await writeFile(join(IMAGES, slug, base), Buffer.from(data, 'base64'));
      return send(res, 200, { path: `/images/${slug}/${base}` });
    }

    if (api === 'api' && name === 'status' && req.method === 'GET') {
      const [st, br, remote] = await Promise.all([run('git', ['status', '--porcelain']), run('git', ['branch', '--show-current']), run('git', ['remote', 'get-url', 'origin'])]);
      return send(res, 200, { changes: st.out ? st.out.split('\n').length : 0, branch: br.out, remote: remote.ok ? remote.out : null });
    }

    if (api === 'api' && name === 'publish' && req.method === 'POST') {
      const { message } = await body(req);
      return send(res, 200, await publish(String(message || '').slice(0, 200)));
    }

    if (req.method === 'GET' && url.pathname === '/vendor/marked.js')
      return res.writeHead(200, { 'content-type': TYPES['.js'] }).end(await readFile(join(ROOT, 'node_modules/marked/lib/marked.esm.js')));
    if (req.method === 'GET' && url.pathname.startsWith('/fs/')) {
      // site fonts, so the preview reads like the real page
      const FS = join(ROOT, 'node_modules/@fontsource-variable');
      const p = join(FS, url.pathname.slice(4));
      if (!p.startsWith(FS + '/')) return send(res, 400, { error: 'Bad path' });
      const type = { '.css': 'text/css', '.woff2': 'font/woff2' }[extname(p)];
      if (!type) return send(res, 404, { error: 'Not found' });
      return res.writeHead(200, { 'content-type': type }).end(await readFile(p));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/images/')) {
      const p = join(ROOT, 'public', url.pathname);
      if (!p.startsWith(IMAGES)) return send(res, 400, { error: 'Bad path' });
      return res.writeHead(200).end(await readFile(p));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/studio.css' || url.pathname === '/studio.js')) {
      const f = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      return res.writeHead(200, { 'content-type': TYPES[extname(f)], 'cache-control': 'no-store' }).end(await readFile(join(ROOT, 'studio', f)));
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.code === 'ENOENT' ? 'That post does not exist.' : e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Studio running at http://localhost:${PORT}`));
