// All patient persistence lives here. The REST controllers and the Vapi tool
// webhook both call into this module, so the voice agent and an HTTP client go
// through exactly the same validation and the same writes.

const { prisma } = require('../lib/prisma');
const { ApiError } = require('../lib/response');
const {
  validatePatient,
  serializePatient,
  normalizePhone,
  parseDob,
  isUuid,
} = require('../lib/validation');

const NOT_DELETED = { deletedAt: null };

function assertUuid(id) {
  if (!isUuid(id)) {
    throw new ApiError(400, 'patient_id must be a valid UUID.');
  }
}

/**
 * List non-deleted patients, optionally filtered.
 * @param {{last_name?: string, date_of_birth?: string, phone_number?: string, limit?: string}} query
 */
async function listPatients(query = {}) {
  const where = { ...NOT_DELETED };

  if (query.last_name) {
    where.lastName = { contains: String(query.last_name).trim(), mode: 'insensitive' };
  }

  if (query.date_of_birth) {
    const parsed = parseDob(query.date_of_birth);
    if (parsed.error) {
      throw new ApiError(400, 'Invalid date_of_birth filter.', [
        { field: 'date_of_birth', message: parsed.error },
      ]);
    }
    where.dateOfBirth = parsed.value;
  }

  if (query.phone_number) {
    const digits = normalizePhone(query.phone_number);
    if (digits.length !== 10) {
      throw new ApiError(400, 'Invalid phone_number filter.', [
        { field: 'phone_number', message: 'Phone number filter must be 10 digits.' },
      ]);
    }
    where.phoneNumber = digits;
  }

  let take = 100;
  if (query.limit !== undefined) {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      throw new ApiError(400, 'limit must be an integer between 1 and 500.');
    }
    take = n;
  }

  const rows = await prisma.patient.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });

  return rows.map(serializePatient);
}

async function getPatient(id) {
  assertUuid(id);
  const row = await prisma.patient.findFirst({ where: { patientId: id, ...NOT_DELETED } });
  if (!row) throw new ApiError(404, 'Patient not found.');
  return serializePatient(row);
}

async function createPatient(body) {
  const { data, errors } = validatePatient(body, { partial: false });
  if (errors.length) {
    throw new ApiError(422, 'Validation failed.', errors);
  }
  if (data.preferredLanguage === undefined || data.preferredLanguage === null) {
    data.preferredLanguage = 'English';
  }
  const row = await prisma.patient.create({ data });
  return serializePatient(row);
}

async function updatePatient(id, body) {
  assertUuid(id);

  const existing = await prisma.patient.findFirst({ where: { patientId: id, ...NOT_DELETED } });
  if (!existing) throw new ApiError(404, 'Patient not found.');

  const { data, errors } = validatePatient(body, { partial: true });
  if (errors.length) {
    throw new ApiError(422, 'Validation failed.', errors);
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(422, 'No updatable fields were provided.');
  }
  // preferred_language is NOT NULL in the schema, so a clear means "back to default".
  if (data.preferredLanguage === null) data.preferredLanguage = 'English';

  const row = await prisma.patient.update({ where: { patientId: id }, data });
  return serializePatient(row);
}

// Soft delete only. Rows are never removed from the table.
async function deletePatient(id) {
  assertUuid(id);
  const existing = await prisma.patient.findFirst({ where: { patientId: id, ...NOT_DELETED } });
  if (!existing) throw new ApiError(404, 'Patient not found.');

  const row = await prisma.patient.update({
    where: { patientId: id },
    data: { deletedAt: new Date() },
  });
  return serializePatient(row);
}

// Used by the voice agent's duplicate check before it creates a new record.
async function findByPhone(phone) {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return null;
  const row = await prisma.patient.findFirst({
    where: { phoneNumber: digits, ...NOT_DELETED },
    orderBy: { createdAt: 'desc' },
  });
  return row ? serializePatient(row) : null;
}

module.exports = {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  findByPhone,
};
