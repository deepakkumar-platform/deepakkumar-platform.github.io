// Terminal version of the studio.
//   npm run new -- "Post title"        creates src/content/posts/<slug>.md as a draft
//   npm run publish -- "What changed"  builds, commits posts + images, pushes to GitHub
import { writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ').trim();
const sh = (c, a) => execFileSync(c, a, { cwd: ROOT, stdio: 'inherit' });

if (cmd === 'new') {
  if (!arg) { console.error('Usage: npm run new -- "Post title"'); process.exit(1); }
  const slug = arg.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const file = join(ROOT, 'src/content/posts', `${slug}.md`);
  if (await stat(file).then(() => true, () => false)) { console.error(`Already exists: ${file}`); process.exit(1); }
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await writeFile(file, `---\ntitle: "${arg.replace(/"/g, '\\"')}"\ndescription: ""\ndate: ${date}\ntags: []\ndraft: true\n---\n\nStart with the thing your reader sees at work.\n`);
  console.log(`Created ${file}\nIt stays hidden until you set draft: false.`);
} else if (cmd === 'publish') {
  sh('npx', ['astro', 'build']);
  sh('git', ['add', 'src/content', 'public']);
  try { execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT }); console.log('Nothing new to commit.'); }
  catch { sh('git', ['commit', '-m', arg || 'Update posts']); }
  sh('git', ['push', '-u', 'origin', 'HEAD']);
  console.log('Pushed. GitHub Actions deploys in about a minute.');
} else {
  console.error('Commands: new "Title" | publish "message"'); process.exit(1);
}
