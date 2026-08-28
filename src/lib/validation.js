// Hand written validation. The voice agent does a first pass over the caller's answers
// but we never trust it. Everything reaching the API is checked again here, and the
// database has CHECK constraints sitting behind that.
//
// Every failure is reported as { field, message } so a caller (including the
// Vapi tool handler) can re-prompt for exactly one field instead of restarting.

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'AS', 'GU', 'MP', 'PR', 'VI', // District of Columbia + US territories
  'AA', 'AE', 'AP',                   // military (APO/FPO) codes
]);

const SEX_VALUES = {
  male: 'MALE',
  m: 'MALE',
  female: 'FEMALE',
  f: 'FEMALE',
  other: 'OTHER',
  'decline to answer': 'DECLINE_TO_ANSWER',
  decline: 'DECLINE_TO_ANSWER',
  declined: 'DECLINE_TO_ANSWER',
  'prefer not to say': 'DECLINE_TO_ANSWER',
  'prefer not to answer': 'DECLINE_TO_ANSWER',
};

const SEX_LABELS = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  DECLINE_TO_ANSWER: 'Decline to Answer',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

// The spec asks for alphabetic plus hyphens and apostrophes. Spaces are allowed
// too, otherwise "Van Der Berg" and "Mary Jane" get rejected, and \p{L} keeps
// accented names like Muñoz working. Must start with a letter.
const NAME_RE = /^\p{L}[\p{L}\p{M}'\- ]*$/u;
const NAME_MAX = 50;

const REQUIRED = [
  'first_name', 'last_name', 'date_of_birth', 'sex', 'phone_number',
  'address_line_1', 'city', 'state', 'zip_code',
];

const OPTIONAL = [
  'email', 'address_line_2', 'insurance_provider', 'insurance_member_id',
  'preferred_language', 'emergency_contact_name', 'emergency_contact_phone',
];

const FIELD_TO_COLUMN = {
  first_name: 'firstName',
  last_name: 'lastName',
  date_of_birth: 'dateOfBirth',
  sex: 'sex',
  phone_number: 'phoneNumber',
  address_line_1: 'addressLine1',
  address_line_2: 'addressLine2',
  city: 'city',
  state: 'state',
  zip_code: 'zipCode',
  email: 'email',
  insurance_provider: 'insuranceProvider',
  insurance_member_id: 'insuranceMemberId',
  preferred_language: 'preferredLanguage',
  emergency_contact_name: 'emergencyContactName',
  emergency_contact_phone: 'emergencyContactPhone',
};

const label = (field) => field.replace(/_/g, ' ');

const str = (v) => {
  if (typeof v === 'string') return v.trim();
  if (v === null || v === undefined) return '';
  return String(v).trim();
};

// Callers say phone numbers every possible way: "(415) 555-0132", "415 555 0132",
// "+1 415 555 0132". Strip to digits and drop a leading US country code.
function normalizePhone(raw) {
  let digits = str(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

function phoneProblem(digits, what) {
  if (digits.length !== 10) return what + ' must be exactly 10 digits.';
  if (digits[0] === '0' || digits[0] === '1') return what + ' has an invalid area code.';
  if (digits[3] === '0' || digits[3] === '1') return what + ' has an invalid exchange code.';
  return null;
}

// Accepts YYYY-MM-DD (what we ask the agent for) and MM/DD/YYYY as a fallback.
// Returns a UTC-midnight Date so no timezone can shift the calendar day.
function parseDob(raw) {
  const s = str(raw);
  let y;
  let m;
  let d;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) {
    y = match[1];
    m = match[2];
    d = match[3];
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!match) {
      return { error: 'Date of birth must be a real date in YYYY-MM-DD format.' };
    }
    m = match[1];
    d = match[2];
    y = match[3];
  }

  y = Number(y);
  m = Number(m);
  d = Number(d);

  const date = new Date(Date.UTC(y, m - 1, d));
  // Catches things like 2001-02-30, which JS would silently roll forward.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: 'Date of birth is not a real calendar date.' };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (date.getTime() > todayUtc) {
    return { error: 'Date of birth cannot be in the future.' };
  }
  if (y < 1900) {
    return { error: 'Date of birth must be on or after 1900.' };
  }

  return { value: date };
}

const MAX_LENGTHS = {
  address_line_2: 200,
  insurance_provider: 150,
  insurance_member_id: 100,
  preferred_language: 60,
  emergency_contact_name: 200,
};

/**
 * @param {object} input raw request body (snake_case field names)
 * @param {object} [opts]
 * @param {boolean} [opts.partial] true for PUT, so only keys present are validated
 * @returns {{ data?: object, errors: Array<{field: string, message: string}> }}
 */
function validatePatient(input, opts) {
  const partial = Boolean(opts && opts.partial);
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = [];
  const data = {};
  const present = (f) => Object.prototype.hasOwnProperty.call(body, f);

  Object.keys(body)
    .filter((k) => REQUIRED.indexOf(k) === -1 && OPTIONAL.indexOf(k) === -1)
    .forEach((key) => {
      errors.push({ field: key, message: 'Unknown field "' + key + '".' });
    });

  // Required fields.
  for (const field of REQUIRED) {
    if (partial && !present(field)) continue;

    const value = str(body[field]);
    if (!value) {
      errors.push({ field, message: label(field) + ' is required.' });
      continue;
    }

    if (field === 'first_name' || field === 'last_name') {
      if (value.length > NAME_MAX) {
        errors.push({ field, message: label(field) + ' must be 50 characters or fewer.' });
      } else if (!NAME_RE.test(value)) {
        errors.push({
          field,
          message: label(field) + ' may only contain letters, spaces, hyphens and apostrophes.',
        });
      } else {
        data[FIELD_TO_COLUMN[field]] = value;
      }
    } else if (field === 'date_of_birth') {
      const parsed = parseDob(value);
      if (parsed.error) errors.push({ field, message: parsed.error });
      else data.dateOfBirth = parsed.value;
    } else if (field === 'sex') {
      const mapped = SEX_VALUES[value.toLowerCase()];
      if (!mapped) {
        errors.push({
          field,
          message: 'Sex must be one of: Male, Female, Other, Decline to Answer.',
        });
      } else {
        data.sex = mapped;
      }
    } else if (field === 'phone_number') {
      const digits = normalizePhone(value);
      const problem = phoneProblem(digits, 'Phone number');
      if (problem) errors.push({ field, message: problem });
      else data.phoneNumber = digits;
    } else if (field === 'address_line_1') {
      if (value.length > 200) {
        errors.push({ field, message: 'Address line 1 must be 200 characters or fewer.' });
      } else {
        data.addressLine1 = value;
      }
    } else if (field === 'city') {
      if (value.length > 100) {
        errors.push({ field, message: 'City must be 100 characters or fewer.' });
      } else {
        data.city = value;
      }
    } else if (field === 'state') {
      const code = value.toUpperCase();
      if (!US_STATES.has(code)) {
        errors.push({
          field,
          message: 'State must be a valid 2-letter US state or territory code.',
        });
      } else {
        data.state = code;
      }
    } else if (field === 'zip_code') {
      const zip = value.replace(/\s/g, '');
      if (!ZIP_RE.test(zip)) {
        errors.push({ field, message: 'ZIP code must be 5 digits, or ZIP+4 as 12345-6789.' });
      } else {
        data.zipCode = zip;
      }
    }
  }

  // Optional fields.
  // An explicit null clears the column; an empty string is treated the same way.
  for (const field of OPTIONAL) {
    if (!present(field)) continue;

    const value = str(body[field]);
    if (!value) {
      if (field === 'preferred_language') data.preferredLanguage = 'English';
      else data[FIELD_TO_COLUMN[field]] = null;
      continue;
    }

    if (field === 'email') {
      if (!EMAIL_RE.test(value) || value.length > 254) {
        errors.push({ field, message: 'Email must be a valid email address.' });
      } else {
        data.email = value;
      }
    } else if (field === 'emergency_contact_phone') {
      const digits = normalizePhone(value);
      const problem = phoneProblem(digits, 'Emergency contact phone');
      if (problem) errors.push({ field, message: problem });
      else data.emergencyContactPhone = digits;
    } else {
      const max = MAX_LENGTHS[field];
      if (max && value.length > max) {
        errors.push({
          field,
          message: label(field) + ' must be ' + max + ' characters or fewer.',
        });
      } else {
        data[FIELD_TO_COLUMN[field]] = value;
      }
    }
  }

  if (errors.length) return { errors };
  return { data, errors: [] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Prisma hands back Date objects and enum keys; the API speaks snake_case,
// ISO dates and human-readable sex labels.
function serializePatient(p) {
  if (!p) return null;
  return {
    patient_id: p.patientId,
    first_name: p.firstName,
    last_name: p.lastName,
    date_of_birth: p.dateOfBirth.toISOString().slice(0, 10),
    sex: SEX_LABELS[p.sex] || p.sex,
    phone_number: p.phoneNumber,
    address_line_1: p.addressLine1,
    address_line_2: p.addressLine2,
    city: p.city,
    state: p.state,
    zip_code: p.zipCode,
    email: p.email,
    insurance_provider: p.insuranceProvider,
    insurance_member_id: p.insuranceMemberId,
    preferred_language: p.preferredLanguage,
    emergency_contact_name: p.emergencyContactName,
    emergency_contact_phone: p.emergencyContactPhone,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    deleted_at: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}

module.exports = {
  validatePatient,
  serializePatient,
  normalizePhone,
  parseDob,
  isUuid,
  REQUIRED,
  OPTIONAL,
  SEX_LABELS,
};
