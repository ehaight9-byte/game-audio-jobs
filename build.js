// Pulls open jobs from game studios' public career boards (Greenhouse, Lever, Ashby),
// keeps the audio roles, and builds a static site into dist/. Runs on Netlify: node build.js
// A source that fails is skipped; the build fails only if every source fails,
// so the last good site stays live when something is badly wrong.
const fs = require('fs');
const { site, match, sources } = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
const OUT = 'dist';
const AUDIO = new RegExp(match, 'i');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const httpsOnly = u => /^https:\/\//.test(u || '') ? u : '';
const day = d => { const t = new Date(d); return isNaN(t) ? '' : t.toISOString().slice(0, 10); };

const URLS = {
  greenhouse: s => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
  lever: s => `https://api.lever.co/v0/postings/${s}?mode=json`,
  ashby: s => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
};
const NORMALIZE = {
  greenhouse: d => (d.jobs || []).map(j => ({ title: j.title, location: j.location && j.location.name, url: j.absolute_url, date: j.first_published || j.updated_at })),
  lever: d => (Array.isArray(d) ? d : []).map(j => ({ title: j.text, location: j.categories && j.categories.location, url: j.hostedUrl, date: j.createdAt })),
  ashby: d => (d.jobs || []).filter(j => j.isListed !== false).map(j => ({ title: j.title, location: j.location + (j.isRemote ? ' (Remote)' : ''), url: j.jobUrl, date: j.publishedAt })),
};

async function fetchSource(src) {
  if (process.env.JOBS_FIXTURE) {
    const all = JSON.parse(fs.readFileSync(process.env.JOBS_FIXTURE, 'utf8'));
    const key = `${src.ats}:${src.slug}`;
    if (!(key in all)) throw new Error('not in fixture');
    return all[key];
  }
  const res = await fetch(URLS[src.ats](src.slug), { headers: { Accept: 'application/json', 'User-Agent': 'GameAudioJobs/1.0' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const page = (path, title, desc, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${site.verification ? `<meta name="google-site-verification" content="${esc(site.verification)}" />\n` : ''}${site.url ? `<link rel="canonical" href="${site.url}${path}">\n` : ''}<link rel="stylesheet" href="/style.css">
</head>
<body>
<header><a href="/">${esc(site.name)}</a></header>
<main>
${body}
</main>
<footer>Listings come directly from each studio's public careers page and link to the official posting. Always apply through the studio.</footer>
</body>
</html>
`;

(async () => {
  const jobs = [], report = [];
  let ok = 0;
  for (const src of sources) {
    try {
      const all = NORMALIZE[src.ats](await fetchSource(src));
      ok++;
      const hits = all.filter(j => j.title && AUDIO.test(j.title) && httpsOnly(j.url));
      hits.forEach(j => jobs.push({ ...j, location: String(j.location || '').replace(/\bBLANK,\s*/g, '').trim(), company: src.company, date: day(j.date) }));
      report.push(`${src.ats}:${src.slug} ok ${all.length} jobs, ${hits.length} audio`);
    } catch (e) { report.push(`${src.ats}:${src.slug} FAILED ${e.message}`); }
  }
  console.log(report.join('\n'));
  if (ok === 0) throw new Error('Every source failed; keeping the previous site.');

  const seen = new Set();
  const list = jobs.filter(j => !seen.has(j.url) && seen.add(j.url)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const studios = [...new Set(list.map(j => j.company))].sort();

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync('style.css', `${OUT}/style.css`);
  const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
  const rows = list.map(j => `<li><a href="${esc(j.url)}" rel="nofollow noopener" target="_blank">${esc(j.title)}</a><span>${esc(j.company)}${j.location ? ' · ' + esc(j.location) : ''}${j.date ? ' · posted ' + esc(j.date) : ''}</span></li>`).join('\n');
  fs.writeFileSync(`${OUT}/index.html`, page('/', `${site.name}: Sound Design, Audio and Music Jobs at Game Studios`,
    'Open sound designer, audio designer, audio programmer and composer jobs at game studios, pulled straight from studio career pages and updated daily.',
    `<h1>Game audio jobs</h1>
<p>Open sound design, audio, music and dialogue roles at game studios, pulled straight from each studio's careers page. Every link goes to the official posting.</p>
<p class="meta">${list.length} open role${list.length === 1 ? '' : 's'} · ${studios.length} studio${studios.length === 1 ? '' : 's'} hiring · updated ${updated}</p>
${list.length ? `<ul class="list">\n${rows}\n</ul>` : '<p>No open audio roles at the studios we track right now. Check back tomorrow.</p>'}
<h2>Studios we check every day</h2>
<p class="meta">${esc([...new Set(sources.map(s => s.company))].sort().join(' · '))}</p>`));
  if (site.url) {
    fs.writeFileSync(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${site.url}/</loc></url>\n</urlset>\n`);
    fs.writeFileSync(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
  }
  console.log(`Built ${list.length} audio jobs from ${ok}/${sources.length} sources.`);
})().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
