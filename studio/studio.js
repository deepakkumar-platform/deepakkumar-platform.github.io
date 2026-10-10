import { marked } from '/vendor/marked.js';

const $ = (id) => document.getElementById(id);
const api = async (path, opts = {}) => {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-studio': '1', ...opts.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

let current = null; // slug
let saved = '';

const template = ({ title, description }) => `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
tags: []
draft: true
---

Start with the thing your reader sees at work.

## First section

`;

const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ---------- preview ----------
function renderPreview() {
  const src = $('src').value;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const get = (k) => fm?.[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
  const body = src
    .slice(fm ? fm[0].length : 0)
    .replace(/^import .*$/gm, '')
    // MDX components can't run here; show where they will appear on the real page
    .replace(/<([A-Z]\w*)([^>]*?)\/>/g, (_, n, a) => `<span class="component" title="Renders on the live page">${n}${a.trim() ? ' ' + escape(a.trim()) : ''}</span>`)
    .replace(/<([A-Z]\w*)([^>]*)>([\s\S]*?)<\/\1>/g, (_, n, a, inner) => `<span class="component" title="Renders on the live page">${n} ${escape(a.trim())}</span>\n\n${inner}`);
  const draft = get('draft') === 'true' ? '<p class="draft-flag">Draft: hidden from the live site until you set draft: false</p>' : '';
  $('preview').innerHTML = `${draft}<h1>${escape(get('title'))}</h1><p class="lede">${escape(get('description'))}</p>${marked.parse(body)}`;
}
const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- list + load ----------
async function refresh() {
  const posts = await api('/api/posts');
  $('list').replaceChildren(...posts.map((p) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = p.slug === current ? 'item on' : 'item';
    b.innerHTML = `<span class="t"></span><span class="d"></span>`;
    b.querySelector('.t').textContent = p.title;
    b.querySelector('.d').textContent = (p.draft ? 'Draft, ' : '') + (p.date || 'no date');
    b.onclick = () => open(p.slug);
    li.append(b);
    return li;
  }));
  const g = await api('/api/status');
  $('git').textContent = g.remote
    ? `${g.changes ? `${g.changes} unpublished change${g.changes > 1 ? 's' : ''}` : 'Everything is published'} on ${g.branch}`
    : 'No GitHub remote yet. See README, "First publish".';
}

async function open(slug) {
  if (isDirty() && !confirm('You have unsaved changes. Leave this post anyway?')) return;
  const p = await api(`/api/posts/${slug}`);
  current = slug; saved = p.content; history.replaceState(null, '', `#${slug}`);
  $('src').value = p.content; $('file').textContent = p.file;
  $('work').hidden = false; $('empty').hidden = true;
  renderPreview(); setDirty(); refresh();
}

// ---------- save ----------
const isDirty = () => current && $('src').value !== saved;
const setDirty = () => { $('dirty').hidden = !isDirty(); };

async function save() {
  if (!current) return;
  const content = $('src').value;
  await api(`/api/posts/${current}`, { method: 'PUT', body: JSON.stringify({ content }) });
  saved = content; setDirty(); refresh();
  flash($('save'), 'Saved');
}
const flash = (btn, text) => { const t = btn.textContent; btn.textContent = text; setTimeout(() => (btn.textContent = t), 1200); };

// ---------- images ----------
$('img').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !current) return;
  const data = btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), ''));
  try {
    const { path } = await api('/api/upload', { method: 'POST', body: JSON.stringify({ slug: current, filename: f.name, data }) });
    insert(`\n![Describe the image for screen readers](${path})\n`);
  } catch (err) { alert(err.message); }
});
function insert(text) {
  const ta = $('src'); const { selectionStart: a, selectionEnd: b } = ta;
  ta.setRangeText(text, a, b, 'end'); ta.focus(); renderPreview(); setDirty();
}

// ---------- new post ----------
$('new').onclick = () => { $('newform').reset(); $('slugview').textContent = '...'; $('newerr').textContent = ''; $('newdlg').showModal(); };
const nf = $('newform');
nf.elements.title.addEventListener('input', () => { nf.elements.slug.value = slugify(nf.elements.title.value); $('slugview').textContent = nf.elements.slug.value || '...'; });
nf.elements.slug.addEventListener('input', () => { $('slugview').textContent = nf.elements.slug.value || '...'; });
$('newdlg').addEventListener('close', async () => {
  if ($('newdlg').returnValue !== 'ok') return;
  const slug = nf.elements.slug.value;
  try {
    await api(`/api/posts/${slug}`, { method: 'PUT', body: JSON.stringify({ content: template({ title: nf.elements.title.value, description: nf.elements.description.value }), create: true }) });
    await open(slug);
  } catch (err) { $('newerr').textContent = err.message; $('newdlg').showModal(); }
});

// ---------- publish ----------
$('publish').onclick = () => {
  $('steps').replaceChildren(); $('pubgo').disabled = false;
  const title = $('src').value.match(/^title:\s*"?(.*?)"?$/m)?.[1] ?? current;
  $('msg').value = `Update post: ${title}`;
  $('pubdlg').showModal();
};
$('pubgo').onclick = async () => {
  if (isDirty()) await save();
  $('pubgo').disabled = true;
  $('steps').innerHTML = '<li class="run">Building and pushing. This takes about 20 seconds.</li>';
  try {
    const r = await api('/api/publish', { method: 'POST', body: JSON.stringify({ message: $('msg').value }) });
    $('steps').replaceChildren(...r.steps.map((s) => {
      const li = document.createElement('li'); li.className = s.ok ? 'ok' : 'fail';
      li.textContent = s.label;
      if (!s.ok && s.out) { const pre = document.createElement('pre'); pre.textContent = s.out.slice(-1500); li.append(pre); }
      return li;
    }));
    const last = document.createElement('li');
    last.className = r.ok ? 'ok' : 'fail';
    last.textContent = r.ok ? 'Published. The live site updates in about a minute.' : 'Not published. Fix the step above, then publish again.';
    $('steps').append(last);
  } catch (err) {
    $('steps').innerHTML = ''; const li = document.createElement('li'); li.className = 'fail'; li.textContent = err.message; $('steps').append(li);
  }
  $('pubgo').disabled = false; refresh();
};

// ---------- editor wiring ----------
$('src').addEventListener('input', () => { renderPreview(); setDirty(); });
$('save').onclick = save;
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
addEventListener('beforeunload', (e) => { if (isDirty()) e.preventDefault(); });

refresh().then(() => { const s = location.hash.slice(1); if (s) open(s).catch(() => {}); });
