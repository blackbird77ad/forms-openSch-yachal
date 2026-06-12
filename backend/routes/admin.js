const express = require('express');
const mongoose = require('mongoose');
const registrationStore = require('../services/registrationStore');
const { sendSlotConfirmation } = require('../services/emailNotifier');

const router = express.Router();
const editableFields = ['fullName', 'email', 'phone', 'country', 'church', 'churchRole'];
const churchRoles = new Set(['Pastor', 'Church worker', 'Leader', 'Member', 'Other']);

function formatDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isValidId(id) {
  return registrationStore.getStoreMode() !== 'mongo' || mongoose.isValidObjectId(id);
}

function sendAdminError(res, error, fallbackMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: 'That email address is already registered.' });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: fallbackMessage });
}

function getRegistrationUpdates(body) {
  const submittedFields = Object.keys(body || {});
  if (submittedFields.length === 0) {
    const error = new Error('Provide at least one registration field to update.');
    error.statusCode = 400;
    throw error;
  }

  const unsupportedFields = submittedFields.filter((field) => !editableFields.includes(field));
  if (unsupportedFields.length > 0) {
    const error = new Error(`These fields cannot be edited here: ${unsupportedFields.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const updates = {};
  editableFields.forEach((field) => {
    if (body[field] === undefined) return;
    const value = String(body[field]).trim();
    if (!value) {
      const error = new Error(`${field} cannot be empty.`);
      error.statusCode = 400;
      throw error;
    }
    updates[field] = field === 'email' ? value.toLowerCase() : value;
  });

  if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
    const error = new Error('Provide a valid email address.');
    error.statusCode = 400;
    throw error;
  }
  if (updates.churchRole && !churchRoles.has(updates.churchRole)) {
    const error = new Error('Provide a valid church role.');
    error.statusCode = 400;
    throw error;
  }

  return updates;
}

router.use((req, res, next) => {
  const adminToken = req.header('x-admin-token');
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ message: 'Unauthorized. Provide a valid admin token.' });
  }
  next();
});

router.post('/database-check', async (req, res) => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return res.status(503).json({ message: 'MongoDB is not connected.' });
  }

  const collection = mongoose.connection.db.collection('database_health_checks');
  const _id = new mongoose.Types.ObjectId();
  const result = { create: false, read: false, update: false, delete: false };

  try {
    const created = await collection.insertOne({ _id, status: 'created', createdAt: new Date() });
    result.create = created.acknowledged === true;

    const read = await collection.findOne({ _id });
    result.read = read?.status === 'created';

    const updated = await collection.updateOne({ _id }, { $set: { status: 'updated' } });
    const readUpdated = await collection.findOne({ _id });
    result.update = updated.modifiedCount === 1 && readUpdated?.status === 'updated';

    const deleted = await collection.deleteOne({ _id });
    result.delete = deleted.deletedCount === 1;

    const passed = Object.values(result).every(Boolean);
    return res.status(passed ? 200 : 503).json({
      status: passed ? 'ok' : 'failed',
      storage: 'mongo',
      database: mongoose.connection.name,
      operations: result,
    });
  } catch (error) {
    return sendAdminError(res, error, 'MongoDB CRUD check failed.');
  } finally {
    if (!result.delete) {
      await collection.deleteOne({ _id }).catch(() => {});
    }
  }
});

router.get('/registrations', async (req, res) => {
  try {
    const registrations = await registrationStore.findAllNewestFirst();
    res.json({
      registrations,
      storage: registrationStore.getStoreMode(),
      database: mongoose.connection.name || null,
    });
  } catch (error) {
    if (error.statusCode === 503) {
      return res.status(503).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: 'Unable to load registrations.' });
  }
});

router.get('/registrations/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid registration ID.' });
  }

  try {
    const registration = await registrationStore.findById(req.params.id);
    if (!registration) {
      return res.status(404).json({ message: 'Registration not found.' });
    }
    return res.json({ registration });
  } catch (error) {
    return sendAdminError(res, error, 'Unable to load registration.');
  }
});

router.patch('/registrations/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid registration ID.' });
  }

  try {
    const updates = getRegistrationUpdates(req.body);
    const registration = await registrationStore.updateById(req.params.id, updates);
    if (!registration) {
      return res.status(404).json({ message: 'Registration not found.' });
    }
    return res.json({ message: 'Registration updated.', registration });
  } catch (error) {
    return sendAdminError(res, error, 'Unable to update registration.');
  }
});

router.delete('/registrations/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid registration ID.' });
  }

  try {
    const registration = await registrationStore.deleteById(req.params.id);
    if (!registration) {
      return res.status(404).json({ message: 'Registration not found.' });
    }
    return res.json({ message: 'Registration deleted.', registration });
  } catch (error) {
    return sendAdminError(res, error, 'Unable to delete registration.');
  }
});

router.post('/registrations/:id/confirm-payment', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid registration ID.' });
  }

  try {
    const registration = await registrationStore.confirmPayment(req.params.id);
    if (!registration) {
      return res.status(404).json({ message: 'Registration not found.' });
    }

    let email = { sent: false };
    try {
      email = await sendSlotConfirmation(registration);
    } catch (error) {
      console.error('Unable to send slot confirmation email:', error.message);
      email = { sent: false, reason: error.message };
    }

    return res.json({
      message: email.sent
        ? 'Payment confirmed and slot confirmation email sent.'
        : 'Payment confirmed, but the slot confirmation email could not be sent.',
      registration,
      email,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error(error);
    return res.status(500).json({ message: 'Unable to confirm payment.' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const registrations = await registrationStore.findAllNewestFirst();
    const header = [
      'Full Name',
      'Email',
      'Phone',
      'Country',
      'Church',
      'Church Role',
      'Attendance Type',
      'Payment Method',
      'Momo Reference',
      'Momo Transaction ID',
      'Status',
      'Created At',
    ];

    const csvRows = [header.join(',')];

    registrations.forEach((item) => {
      const row = [
        item.fullName,
        item.email,
        item.phone,
        item.country,
        item.church || '',
        item.churchRole || '',
        item.attendanceType,
        item.paymentMethod,
        item.momoReference || '',
        item.momoTransactionId || '',
        item.status,
        formatDate(item.createdAt),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
      csvRows.push(row);
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
    res.send(csvRows.join('\n'));
  } catch (error) {
    if (error.statusCode === 503) {
      return res.status(503).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: 'Unable to export registrations.' });
  }
});

module.exports = router;
