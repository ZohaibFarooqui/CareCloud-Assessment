// Every response in this API uses the same envelope:
//   success -> { "data": <payload>, "error": null }
//   failure -> { "data": null, "error": "<message>" }
// On validation failures we also attach `details` so the voice agent can tell
// which specific field to re-prompt for.

function ok(res, data, status = 200) {
  return res.status(status).json({ data, error: null });
}

function fail(res, status, message, details) {
  const body = { data: null, error: message };
  if (details && details.length) body.details = details;
  return res.status(status).json(body);
}

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Express 5 forwards rejected promises to the error handler on its own, but
// wrapping keeps this working if the app is ever run on Express 4.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ok, fail, ApiError, asyncHandler };
