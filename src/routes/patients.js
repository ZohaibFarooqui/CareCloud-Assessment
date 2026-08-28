const express = require('express');
const { asyncHandler } = require('../lib/response');
const controller = require('../controllers/patients');

const router = express.Router();

router.get('/', asyncHandler(controller.index));
router.post('/', asyncHandler(controller.create));
router.get('/:id', asyncHandler(controller.show));
router.put('/:id', asyncHandler(controller.update));
router.patch('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.destroy));

module.exports = router;
