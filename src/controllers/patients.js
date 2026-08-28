const { ok } = require('../lib/response');
const service = require('../services/patients');

async function index(req, res) {
  const patients = await service.listPatients(req.query);
  return ok(res, patients);
}

async function show(req, res) {
  const patient = await service.getPatient(req.params.id);
  return ok(res, patient);
}

async function create(req, res) {
  const patient = await service.createPatient(req.body);
  console.log('[patients] created', JSON.stringify(patient));
  return ok(res, patient, 201);
}

async function update(req, res) {
  const patient = await service.updatePatient(req.params.id, req.body);
  console.log('[patients] updated', JSON.stringify(patient));
  return ok(res, patient);
}

async function destroy(req, res) {
  const patient = await service.deletePatient(req.params.id);
  console.log('[patients] soft-deleted', patient.patient_id);
  return ok(res, patient);
}

module.exports = { index, show, create, update, destroy };
