const express = require('express');

const patientsRouter = require('./routes/patients');
const vapiRouter = require('./routes/vapi');
const patientsService = require('./services/patients');
const { renderDashboard, renderPatient, renderNotFound } = require('./views/dashboard');
const { renderHome } = require('./views/home');
const { prisma } = require('./lib/prisma');
const { ok, fail, ApiError, asyncHandler } = require('./lib/response');
const { normalizePhone } = require('./lib/validation');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// Overview page. The counts are read live rather than hardcoded, and a database
// outage degrades the numbers instead of taking the page down.
app.get(
  '/',
  asyncHandler(async (req, res) => {
    let patientCount = 0;
    let latest = null;
    let dbOk = true;

    try {
      patientCount = await prisma.patient.count({ where: { deletedAt: null } });
      const newest = await prisma.patient.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      latest = newest ? newest.createdAt.toISOString() : null;
    } catch (err) {
      console.error('[home]', err);
      dbOk = false;
    }

    return res
      .status(200)
      .type('html')
      .send(renderHome({ patientCount, latest, dbOk }));
  })
);

app.get('/health', (req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

app.use('/patients', patientsRouter);
app.use('/vapi', vapiRouter);

// One search box for both supported filters: digits look like a phone number,
// anything else is treated as a last name.
app.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const filters = {};

    if (q) {
      const digits = normalizePhone(q);
      if (digits.length === 10) filters.phone_number = digits;
      else filters.last_name = q;
    }

    try {
      const patients = await patientsService.listPatients(filters);
      return res.status(200).type('html').send(renderDashboard({ patients, q }));
    } catch (err) {
      // The dashboard should render an explanation, never a JSON error blob.
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not load patients. Check that DATABASE_URL is set and migrations have run.';
      if (!(err instanceof ApiError)) console.error('[dashboard]', err);
      return res.status(200).type('html').send(renderDashboard({ patients: [], q, error: message }));
    }
  })
);

app.get(
  '/dashboard/:id',
  asyncHandler(async (req, res) => {
    try {
      const patient = await patientsService.getPatient(req.params.id);
      return res.status(200).type('html').send(renderPatient(patient));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        return res.status(err.status).type('html').send(renderNotFound(err.message));
      }
      throw err;
    }
  })
);

// Malformed JSON bodies surface here before any route runs.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return fail(res, 400, 'Request body must be valid JSON.');
  }
  return next(err);
});

app.use((req, res) => fail(res, 404, 'Route not found: ' + req.method + ' ' + req.path));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return fail(res, err.status, err.message, err.details);
  }

  // Prisma "record not found" from a concurrent delete between our read and write.
  if (err && err.code === 'P2025') {
    return fail(res, 404, 'Patient not found.');
  }
  // A CHECK constraint rejected the row -- validation should have caught it first.
  if (err && (err.code === 'P2010' || err.code === 'P2000' || err.code === 'P2003')) {
    return fail(res, 422, 'The database rejected this record.', [
      { field: 'unknown', message: err.message },
    ]);
  }

  console.error('[unhandled]', err);
  return fail(res, 500, 'Internal server error.');
});

module.exports = app;
