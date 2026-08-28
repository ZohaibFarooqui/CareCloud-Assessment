// Patient list and detail. Server-rendered so the whole thing is one HTTP round
// trip and there is no client-side state to get wrong.

const {
  escapeHtml,
  formatPhone,
  formatDate,
  formatTimestamp,
  page,
} = require('./shared');

function renderRows(patients) {
  return patients
    .map((p) => `
        <tr>
          <td class="name"><a href="/dashboard/${escapeHtml(p.patient_id)}">${escapeHtml(p.last_name)}, ${escapeHtml(p.first_name)}</a></td>
          <td>${escapeHtml(formatDate(p.date_of_birth))}</td>
          <td>${escapeHtml(formatPhone(p.phone_number))}</td>
          <td>${escapeHtml(p.city)}, ${escapeHtml(p.state)}</td>
          <td>${escapeHtml(formatTimestamp(p.created_at))}</td>
        </tr>`)
    .join('');
}

/**
 * @param {object} opts
 * @param {Array} opts.patients  serialized patient records
 * @param {string} opts.q        raw search term, echoed back into the box
 * @param {string} [opts.error]  message to show instead of the table
 */
function renderDashboard({ patients = [], q = '', error = null }) {
  const hasSearch = Boolean(q);

  let listing;
  if (error) {
    listing = `<p class="err">${escapeHtml(error)}</p>`;
  } else if (!patients.length) {
    listing = `<div class="panel"><p class="empty">${
      hasSearch ? 'No patients match that search.' : 'No patients registered yet. Call the agent to add one.'
    }</p></div>`;
  } else {
    listing = `
      <p class="count">${patients.length} patient${patients.length === 1 ? '' : 's'}${
        hasSearch ? ' matching "' + escapeHtml(q) + '"' : ''
      }</p>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Name</th><th>Date of birth</th><th>Phone</th><th>City / State</th><th>Registered</th>
        </tr></thead>
        <tbody>${renderRows(patients)}</tbody>
      </table></div>`;
  }

  const body = `
  <h1>Patients</h1>
  <p class="lede">Records collected by the phone intake agent. Soft-deleted records are hidden.</p>

  <form class="search" method="get" action="/dashboard">
    <input type="search" name="q" value="${escapeHtml(q)}"
           placeholder="Search by last name or phone number" aria-label="Search patients">
    <button type="submit">Search</button>
    ${hasSearch ? '<a class="btn ghost" href="/dashboard">Clear</a>' : ''}
  </form>

  ${listing}

  <footer>Same data as <code>GET /patients</code>.</footer>`;

  return page({ title: 'Patients', body, active: 'Patients' });
}

const field = (label, value) =>
  '<dt>' + escapeHtml(label) + '</dt>' +
  (value
    ? '<dd>' + escapeHtml(value) + '</dd>'
    : '<dd class="none">not provided</dd>');

function renderPatient(p) {
  const address = [
    p.address_line_1,
    p.address_line_2,
    p.city + ', ' + p.state + ' ' + p.zip_code,
  ].filter(Boolean).join('\n');

  const body = `
  <h1>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</h1>
  <p class="lede">
    Registered ${escapeHtml(formatTimestamp(p.created_at))}${
      p.updated_at !== p.created_at ? ' &middot; updated ' + escapeHtml(formatTimestamp(p.updated_at)) : ''
    }
  </p>

  <div class="panel pad">
    <dl class="fields">
      ${field('Date of birth', formatDate(p.date_of_birth))}
      ${field('Sex', p.sex)}
      ${field('Phone', formatPhone(p.phone_number))}
      ${field('Email', p.email)}
      ${field('Address', address)}
      ${field('Preferred language', p.preferred_language)}
    </dl>
  </div>

  <h2>Insurance</h2>
  <div class="panel pad">
    <dl class="fields">
      ${field('Provider', p.insurance_provider)}
      ${field('Member ID', p.insurance_member_id)}
    </dl>
  </div>

  <h2>Emergency contact</h2>
  <div class="panel pad">
    <dl class="fields">
      ${field('Name', p.emergency_contact_name)}
      ${field('Phone', formatPhone(p.emergency_contact_phone))}
    </dl>
  </div>

  <h2>Record</h2>
  <div class="panel pad">
    <dl class="fields">
      <dt>patient_id</dt><dd><span class="mono">${escapeHtml(p.patient_id)}</span></dd>
      <dt>API</dt><dd><a href="/patients/${escapeHtml(p.patient_id)}"><code>GET /patients/${escapeHtml(p.patient_id)}</code></a></dd>
    </dl>
  </div>

  <p style="margin-top:1.75rem"><a class="btn ghost" href="/dashboard">&larr; All patients</a></p>`;

  return page({
    title: p.first_name + ' ' + p.last_name,
    body,
    active: 'Patients',
  });
}

function renderNotFound(message) {
  const body = `
  <h1>Not found</h1>
  <p class="lede">${escapeHtml(message)}</p>
  <p><a class="btn ghost" href="/dashboard">&larr; All patients</a></p>`;
  return page({ title: 'Not found', body, active: 'Patients' });
}

module.exports = { renderDashboard, renderPatient, renderNotFound };
