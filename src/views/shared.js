// Shared chrome for the server-rendered pages. No framework, no CDN, no build
// step -- the whole front end is string templates and one stylesheet.

const AUTHOR = {
  name: 'Muhammad Zohaib Farooqui',
  linkedin: 'https://www.linkedin.com/in/zohaib-farooqui-75613a231/',
  github: 'https://github.com/ZohaibFarooqui',
  repo: 'https://github.com/ZohaibFarooqui/CareCloud-Assessment',
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (v) =>
  v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const formatPhone = (d) =>
  d && d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d || '';

const formatDate = (iso) => {
  if (!iso) return '';
  const parts = iso.slice(0, 10).split('-');
  return parts[1] + '/' + parts[2] + '/' + parts[0];
};

const formatTimestamp = (iso) => {
  if (!iso) return '';
  const dt = new Date(iso);
  return (
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
};

const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #f7f7f8; --panel: #fff; --line: #e4e4e7; --ink: #18181b;
    --muted: #71717a; --accent: #0f766e; --accent-ink: #fff; --chip: #f4f4f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f11; --panel: #17171a; --line: #2a2a30; --ink: #ededf0;
      --muted: #9a9aa3; --accent: #2dd4bf; --accent-ink: #06231f; --chip: #212127;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; }
  main { max-width: 940px; margin: 0 auto; padding: 0 1.25rem 4rem; }

  nav {
    border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
  }
  nav .inner {
    max-width: 940px; margin: 0 auto; padding: .85rem 1.25rem;
    display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;
  }
  nav .brand { font-weight: 650; letter-spacing: -.01em; text-decoration: none; margin-right: auto; }
  nav a.link { color: var(--muted); text-decoration: none; font-size: .9rem; }
  nav a.link:hover, nav a.link[aria-current="page"] { color: var(--ink); }

  h1 { font-size: 1.75rem; letter-spacing: -.02em; margin: 2.25rem 0 .4rem; }
  h2 { font-size: 1.05rem; letter-spacing: -.01em; margin: 2.5rem 0 .85rem; }
  p.lede { color: var(--muted); margin: 0 0 1.75rem; max-width: 60ch; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
  .pad { padding: 1.1rem 1.25rem; }

  .grid { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .stat .n { font-size: 1.6rem; font-weight: 650; letter-spacing: -.02em; }
  .stat .k { color: var(--muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; }

  .cta { display: flex; gap: 1.25rem; align-items: center; flex-wrap: wrap; }
  .cta .num {
    font-size: 1.55rem; font-weight: 650; letter-spacing: -.02em;
    text-decoration: none; white-space: nowrap;
  }
  .cta .num:hover { color: var(--accent); }

  form.search { display: flex; gap: .5rem; margin: 0 0 1.1rem; flex-wrap: wrap; }
  input[type=search] {
    flex: 1 1 260px; padding: .6rem .75rem; font-size: .95rem; color: inherit;
    border: 1px solid var(--line); border-radius: 8px; background: var(--panel);
  }
  input[type=search]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  button, .btn {
    padding: .6rem 1.05rem; font-size: .92rem; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink);
    text-decoration: none; display: inline-flex; align-items: center; font-family: inherit;
  }
  .btn.ghost { background: transparent; color: var(--muted); border-color: var(--line); }

  .table-wrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .65rem .9rem; border-bottom: 1px solid var(--line); }
  th {
    font-size: .72rem; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); font-weight: 600; white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: var(--chip); }
  td.name a { font-weight: 600; text-decoration: none; }
  td.name a:hover { color: var(--accent); }

  dl.fields { display: grid; grid-template-columns: minmax(150px, auto) 1fr; gap: .55rem 1.25rem; margin: 0; }
  dl.fields dt { color: var(--muted); font-size: .85rem; }
  dl.fields dd { margin: 0; }
  dl.fields dd.none { color: var(--muted); font-style: italic; }

  code, .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .87em;
  }
  code { background: var(--chip); padding: .12rem .35rem; border-radius: 4px; }
  .method {
    display: inline-block; min-width: 3.6rem; text-align: center; padding: .1rem .4rem;
    border-radius: 4px; background: var(--chip); font-size: .75rem; font-weight: 650;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .flow { display: flex; align-items: stretch; gap: .5rem; flex-wrap: wrap; }
  .flow .box {
    flex: 1 1 140px; border: 1px solid var(--line); border-radius: 8px;
    padding: .7rem .8rem; background: var(--panel); min-width: 130px;
  }
  .flow .box b { display: block; font-size: .9rem; }
  .flow .box span { color: var(--muted); font-size: .78rem; }
  .flow .arrow { align-self: center; color: var(--muted); font-size: 1.1rem; }

  .empty { padding: 2.75rem 1rem; text-align: center; color: var(--muted); }
  .err {
    padding: .8rem 1rem; border: 1px solid #e0b4b4; background: #fdf2f2;
    color: #8a1f1f; border-radius: 8px;
  }
  @media (prefers-color-scheme: dark) {
    .err { background: #2a1616; border-color: #5a2a2a; color: #f3b4b4; }
  }
  .count { color: var(--muted); font-size: .85rem; margin: 0 0 .6rem; }
  footer { margin-top: 3rem; color: var(--muted); font-size: .82rem; }

  .site-footer { border-top: 1px solid var(--line); margin-top: 3.5rem; background: var(--panel); }
  .site-footer .inner {
    max-width: 940px; margin: 0 auto; padding: 1.4rem 1.25rem 2rem;
    display: flex; justify-content: space-between; align-items: baseline;
    gap: .75rem 1.5rem; flex-wrap: wrap; font-size: .84rem; color: var(--muted);
  }
  .site-footer .by { color: var(--ink); font-weight: 600; }
  .site-footer a { color: var(--muted); text-decoration: none; }
  .site-footer a:hover { color: var(--accent); }
  .site-footer .sep { opacity: .45; margin: 0 .45rem; }
  ul.plain { padding-left: 1.1rem; }
  ul.plain li { margin: .3rem 0; }
  @media (max-width: 560px) {
    dl.fields { grid-template-columns: 1fr; gap: .15rem .5rem; }
    dl.fields dd { margin-bottom: .5rem; }
  }
`;

function page({ title, body, active }) {
  const nav = (href, label) =>
    '<a class="link" href="' + href + '"' + (active === label ? ' aria-current="page"' : '') + '>' +
    label + '</a>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="author" content="${escapeHtml(AUTHOR.name)}">
<meta name="description" content="Voice AI patient registration agent. Take-home technical assessment for CareCloud by ${escapeHtml(AUTHOR.name)}.">
<style>${STYLES}</style>
</head>
<body>
<nav><div class="inner">
  <a class="brand" href="/">Voice Patient Intake</a>
  ${nav('/', 'Overview')}
  ${nav('/dashboard', 'Patients')}
  <a class="link" href="${AUTHOR.repo}" target="_blank" rel="noopener noreferrer">Source</a>
</div></nav>
<main>
${body}
</main>
${siteFooter()}
</body>
</html>`;
}

// Attribution, shown on every page.
function siteFooter() {
  return `<footer class="site-footer"><div class="inner">
  <div>
    Made by <span class="by">Muhammad Zohaib Farooqui</span>
    <span class="sep">&middot;</span>
    <a href="${AUTHOR.linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
    <span class="sep">&middot;</span>
    <a href="${AUTHOR.github}" target="_blank" rel="noopener noreferrer">GitHub</a>
  </div>
  <div>Take-home technical assessment for CareCloud &middot; demo data only</div>
</div></footer>`;
}

module.exports = { escapeHtml, formatPhone, formatDate, formatTimestamp, page, AUTHOR };
