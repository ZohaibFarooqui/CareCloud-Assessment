// Webhook Vapi calls when the assistant invokes one of its tools.
//
// Vapi POSTs:
//   { "message": { "type": "tool-calls", "toolCallList": [ { id, name, arguments } ] } }
// and expects back:
//   { "results": [ { "toolCallId": "...", "result": <anything> } ] }
//
// Two things matter here:
//  1. This handler owns no persistence logic. It calls the same service module
//     the REST controllers use, so the voice path and the HTTP path cannot drift.
//  2. A validation failure is NOT an HTTP error. Vapi needs a 200 with a result
//     the model can read, so a bad DOB comes back as a result that names the
//     offending field and the assistant re-prompts for just that one.

const express = require('express');
const { asyncHandler } = require('../lib/response');
const service = require('../services/patients');

const router = express.Router();

// Vapi has shipped a few shapes for this payload over time, and `arguments`
// sometimes arrives as a JSON string. Normalize before dispatching.
function extractToolCalls(message) {
  if (!message) return [];
  const raw = message.toolCallList || message.toolCalls || message.tool_calls || [];
  if (!Array.isArray(raw)) return [];

  return raw.map((call) => {
    const fn = call.function || {};
    let args = call.arguments !== undefined ? call.arguments : fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    return {
      id: call.id || call.toolCallId,
      name: call.name || fn.name,
      args: args && typeof args === 'object' ? args : {},
    };
  });
}

// Turn an ApiError (or anything else) into something the model can act on.
function toFailureResult(err) {
  if (err && err.status === 422 && Array.isArray(err.details) && err.details.length) {
    return {
      status: 'invalid',
      // The assistant is instructed to re-ask only for the fields listed here.
      invalid_fields: err.details.map((d) => ({ field: d.field, reason: d.message })),
      message:
        'Some fields did not pass validation. Ask the caller again for exactly these fields: ' +
        err.details.map((d) => d.field).join(', '),
    };
  }
  if (err && err.status === 404) {
    return { status: 'not_found', message: 'No matching patient record exists.' };
  }
  console.error('[vapi] tool error', err);
  return {
    status: 'error',
    message:
      'The record could not be saved because of a system error. Apologize, tell the caller ' +
      'someone from the office will follow up, and end the call.',
  };
}

async function lookupPatientByPhone(args) {
  const patient = await service.findByPhone(args.phone_number);
  if (!patient) {
    return {
      status: 'ok',
      found: false,
      message: 'No existing record for that phone number. Continue with a new registration.',
    };
  }
  return {
    status: 'ok',
    found: true,
    patient_id: patient.patient_id,
    first_name: patient.first_name,
    last_name: patient.last_name,
    message:
      'An existing record was found for ' +
      patient.first_name +
      ' ' +
      patient.last_name +
      '. Ask whether they want to update it instead of creating a new one. If yes, call ' +
      'update_patient with this patient_id.',
  };
}

async function savePatient(args) {
  const patient = await service.createPatient(args);
  console.log('[call-complete] created', JSON.stringify(patient));
  return {
    status: 'ok',
    patient_id: patient.patient_id,
    message:
      'Saved successfully. Confirm to the caller that registration is complete, thank them by ' +
      'first name, and end the call.',
  };
}

async function updatePatientTool(args) {
  const { patient_id: patientId, ...fields } = args;
  const patient = await service.updatePatient(patientId, fields);
  console.log('[call-complete] updated', JSON.stringify(patient));
  return {
    status: 'ok',
    patient_id: patient.patient_id,
    message:
      'Record updated successfully. Confirm to the caller, thank them by first name, and end the call.',
  };
}

const HANDLERS = {
  lookup_patient_by_phone: lookupPatientByPhone,
  save_patient: savePatient,
  update_patient: updatePatientTool,
};

router.post(
  '/tool',
  asyncHandler(async (req, res) => {
    const message = (req.body && req.body.message) || {};

    // Vapi sends many event types to the same URL. We only act on tool calls,
    // but the end-of-call report is where we log the completed record.
    if (message.type === 'end-of-call-report') {
      console.log(
        '[call-complete] end-of-call-report',
        JSON.stringify({
          call_id: message.call && message.call.id,
          ended_reason: message.endedReason,
          summary: message.summary,
        })
      );
      return res.status(200).json({ received: true });
    }

    const calls = extractToolCalls(message);
    if (!calls.length) {
      return res.status(200).json({ received: true });
    }

    const results = [];
    for (const call of calls) {
      const handler = HANDLERS[call.name];
      if (!handler) {
        console.warn('[vapi] unknown tool', call.name);
        results.push({
          toolCallId: call.id,
          result: { status: 'error', message: 'Unknown tool: ' + call.name },
        });
        continue;
      }

      console.log('[vapi] tool call', call.name, JSON.stringify(call.args));
      try {
        results.push({ toolCallId: call.id, result: await handler(call.args) });
      } catch (err) {
        results.push({ toolCallId: call.id, result: toFailureResult(err) });
      }
    }

    return res.status(200).json({ results });
  })
);

module.exports = router;
