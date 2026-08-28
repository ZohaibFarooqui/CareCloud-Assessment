// Overview page. Everything numeric on it is queried live -- nothing is hardcoded,
// so it can't drift away from what the database actually contains.

const { escapeHtml, formatPhone, formatTimestamp, page } = require('./shared');

const PHONE = '+15047388188';

const ENDPOINTS = [
  ['GET', '/patients', 'List patients. Filters: last_name, date_of_birth, phone_number', true],
  ['GET', '/patients/:id', 'Fetch one by UUID', false],
  ['POST', '/patients', 'Create; returns the record with its patient_id', false],
  ['PUT', '/patients/:id', 'Partial update', false],
  ['DELETE', '/patients/:id', 'Soft delete; sets deleted_at, never removes the row', false],
  ['POST', '/vapi/tool', 'Webhook the voice agent calls', false],
  ['GET', '/health', 'Liveness', true],
];

const STACK = [
  ['Telephony, STT, TTS', 'Vapi', 'Handles the phone number, transcription, voice and turn-taking. Building STT/TTS by hand was out of scope.'],
  ['LLM', 'Gemini 2.5 Flash', 'Native Vapi provider, free tier, and fast — latency between turns is what makes an agent feel robotic.'],
  ['API', 'Node + Express 5', 'One app, one serverless function, routing stays in Express.'],
  ['Database', 'Postgres (Neon)', 'Vercel functions have no disk, so SQLite would not survive a restart.'],
  ['ORM', 'Prisma', 'Migrations, and the schema doubles as documentation.'],
  ['Front end', 'Server-rendered HTML', 'No framework, no build step, no client state.'],
];

function statCard(n, k) {
  return '<div class="panel pad stat"><div class="n">' + escapeHtml(String(n)) +
    '</div><div class="k">' + escapeHtml(k) + '</div></div>';
}

/**
 * @param {object} opts
 * @param {number} opts.patientCount   live count of non-deleted records
 * @param {string|null} opts.latest    ISO timestamp of the most recent registration
 * @param {string} opts.baseUrl        this deployment's own origin
 * @param {boolean} opts.dbOk          whether the count query succeeded
 */
function renderHome({ patientCount = 0, latest = null, baseUrl = '', dbOk = true }) {
  const endpointRows = ENDPOINTS.map(([method, path, desc, linkable]) => {
    const shown = linkable
      ? '<a href="' + escapeHtml(path) + '"><code>' + escapeHtml(path) + '</code></a>'
      : '<code>' + escapeHtml(path) + '</code>';
    return '<tr><td><span class="method">' + method + '</span></td><td>' + shown +
      '</td><td>' + escapeHtml(desc) + '</td></tr>';
  }).join('');

  const stackRows = STACK.map(([layer, choice, why]) =>
    '<tr><td>' + escapeHtml(layer) + '</td><td><b>' + escapeHtml(choice) + '</b></td><td>' +
    escapeHtml(why) + '</td></tr>'
  ).join('');

  const body = `
  <h1>Voice patient registration</h1>
  <p class="lede">
    Call the number below and a voice agent takes your demographic details the way a front-desk
    coordinator would, then writes them to Postgres. This page, the REST API and the agent's
    tool webhook are all the same Express app.
  </p>

  <div class="panel pad cta">
    <div>
      <div class="k" style="color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.05em">Call the agent</div>
      <a class="num" href="tel:${PHONE}">${formatPhone('5047388188')}</a>
    </div>
    <a class="btn" href="/dashboard">See registered patients</a>
  </div>

  <h2>Right now</h2>
  <div class="grid">
    ${dbOk ? statCard(patientCount, 'Patients on file') : statCard('—', 'Database unreachable')}
    ${statCard(latest ? formatTimestamp(latest) : 'None yet', 'Most recent registration')}
    ${statCard('Live', 'Agent status')}
  </div>

  <h2>How a call flows</h2>
  <div class="flow">
    <div class="box"><b>Caller</b><span>dials the number</span></div>
    <div class="arrow">&rarr;</div>
    <div class="box"><b>Vapi</b><span>speech in and out, turn-taking</span></div>
    <div class="arrow">&rarr;</div>
    <div class="box"><b>Gemini</b><span>runs the intake conversation</span></div>
    <div class="arrow">&rarr;</div>
    <div class="box"><b>This app</b><span>validates and writes</span></div>
    <div class="arrow">&rarr;</div>
    <div class="box"><b>Postgres</b><span>persists the record</span></div>
  </div>
  <p class="lede" style="margin-top:1rem">
    The agent never writes to the database itself. It calls a tool, which is an HTTP request to
    <code>/vapi/tool</code>, and that handler goes through the same service module as
    <code>POST /patients</code> — so the voice path and the API path cannot drift apart.
  </p>

  <h2>What the agent handles</h2>
  <ul class="plain">
    <li>Multi-field answers in one breath — <em>"I'm Jane Davis, born March third nineteen ninety."</em></li>
    <li>Mid-call corrections without restarting — <em>"actually it's D-A-V-I-S, not D-A-V-I-E-S."</em></li>
    <li>Re-prompting for only the field that failed, never the whole form.</li>
    <li>Reading the full record back and waiting for confirmation before it saves anything.</li>
    <li>Recognising a returning caller by phone number and offering to update instead of duplicate.</li>
    <li>Saying something useful if the write fails, rather than going silent.</li>
  </ul>

  <h2>API</h2>
  <p class="lede">
    Every response uses the envelope <code>{"data": …, "error": null}</code>, with a
    <code>details</code> array naming the offending fields on a validation failure.
  </p>
  <div class="table-wrap"><table>
    <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
    <tbody>${endpointRows}</tbody>
  </table></div>

  <h2>Stack</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Layer</th><th>Choice</th><th>Why</th></tr></thead>
    <tbody>${stackRows}</tbody>
  </table></div>

  <footer>
    Assessment build. Seeded with fictional demo records — no real patient data.
    Full write-up, trade-offs and known limitations are in the
    <a href="https://github.com/ZohaibFarooqui/CareCloud-Assessment" rel="noopener">README</a>.
  </footer>`;

  return page({ title: 'Voice Patient Registration', body, active: 'Overview' });
}

module.exports = { renderHome };
