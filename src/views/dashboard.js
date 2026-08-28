// Server-rendered so the whole thing is one HTTP round trip and there is no
// client-side state to get wrong. It also sidesteps static-asset bundling on
// Vercel entirely -- the function returns the HTML directly.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (v) =>
  v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const formatPhone = (d) =>
  d && d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d || '';

const formatDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return m + '/' + d + '/' + y;
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
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; background: #fafafa;
  }
  main { max-width: 1080px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .sub { color: #666; margin: 0 0 1.5rem; font-size: .9rem; }
  form { display: flex; gap: .5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
  input[type=search] {
    flex: 1 1 260px; padding: .55rem .7rem; font-size: 1rem;
    border: 1px solid #ccc; border-radius: 6px; background: #fff; color: inherit;
  }
  button, .clear {
    padding: .55rem 1rem; font-size: .95rem; border-radius: 6px; cursor: pointer;
    border: 1px solid #2b2b2b; background: #2b2b2b; color: #fff; text-decoration: none;
    display: inline-flex; align-items: center;
  }
  .clear { background: transparent; color: #444; border-color: #ccc; }
  .count { color: #666; font-size: .85rem; margin-bottom: .5rem; }
  .table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e3e3e3; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; min-width: 760px; }
  th, td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid #eee; white-space: nowrap; }
  th { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #666; background: #f6f6f6; }
  tr:last-child td { border-bottom: 0; }
  td.name { font-weight: 600; }
  .empty { padding: 2.5rem 1rem; text-align: center; color: #777; }
  .err { padding: .75rem 1rem; border: 1px solid #e0b4b4; background: #fdf2f2; color: #8a1f1f; border-radius: 6px; }
  footer { margin-top: 1.5rem; color: #888; font-size: .8rem; }
  code { background: #eee; padding: .1rem .3rem; border-radius: 3px; }
  @media (prefers-color-scheme: dark) {
    body { background: #151515; color: #e8e8e8; }
    .sub, .count, th, footer { color: #9a9a9a; }
    .table-wrap { background: #1e1e1e; border-color: #333; }
    th { background: #242424; }
    th, td { border-color: #2c2c2c; }
    input[type=search] { background: #1e1e1e; border-color: #3a3a3a; }
    button { background: #e8e8e8; color: #151515; border-color: #e8e8e8; }
    .clear { color: #bbb; border-color: #3a3a3a; }
    code { background: #2a2a2a; }
  }
`;

function renderRows(patients) {
  return patients
    .map(
      (p) => `
        <tr>
          <td class="name">${escapeHtml(p.last_name)}, ${escapeHtml(p.first_name)}</td>
          <td>${escapeHtml(formatDate(p.date_of_birth))}</td>
          <td>${escapeHtml(formatPhone(p.phone_number))}</td>
          <td>${escapeHtml(p.city)}, ${escapeHtml(p.state)}</td>
          <td>${escapeHtml(formatTimestamp(p.created_at))}</td>
        </tr>`
    )
    .join('');
}

/**
 * @param {object} opts
 * @param {Array} opts.patients  serialized patient records
 * @param {string} opts.q        the raw search term, echoed back into the box
 * @param {string} [opts.error]  message to show instead of the table
 */
function renderDashboard({ patients = [], q = '', error = null }) {
  const hasSearch = Boolean(q);

  let body;
  if (error) {
    body = `<p class="err">${escapeHtml(error)}</p>`;
  } else if (!patients.length) {
    body = `<div class="table-wrap"><p class="empty">${
      hasSearch ? 'No patients match that search.' : 'No patients registered yet.'
    }</p></div>`;
  } else {
    body = `
      <p class="count">${patients.length} patient${patients.length === 1 ? '' : 's'}${
        hasSearch ? ' matching "' + escapeHtml(q) + '"' : ''
      }</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Date of birth</th><th>Phone</th><th>City / State</th><th>Registered</th>
            </tr>
          </thead>
          <tbody>${renderRows(patients)}</tbody>
        </table>
      </div>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patient Registrations</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <h1>Patient Registrations</h1>
  <p class="sub">Records collected by the phone intake agent.</p>

  <form method="get" action="/dashboard">
    <input type="search" name="q" value="${escapeHtml(q)}"
           placeholder="Search by last name or phone number" aria-label="Search patients">
    <button type="submit">Search</button>
    ${hasSearch ? '<a class="clear" href="/dashboard">Clear</a>' : ''}
  </form>

  ${body}

  <footer>Read-only view. Same data as <code>GET /patients</code>. Soft-deleted records are hidden.</footer>
</main>
</body>
</html>`;
}

module.exports = { renderDashboard };
