const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Registration = require('../models/Registration');

const localStorePath =
  process.env.LOCAL_REGISTRATION_STORE ||
  path.join(__dirname, '..', 'data', 'registrations.local.json');

let fileFallbackEnabled = false;
let syncPromise = null;

function enableFileFallback() {
  fileFallbackEnabled = true;
  return localStorePath;
}

function getStoreMode() {
  if (mongoose.connection.readyState === 1) {
    return 'mongo';
  }

  if (fileFallbackEnabled) {
    return 'file';
  }

  return 'unavailable';
}

function createUnavailableError() {
  const error = new Error('Registration storage is temporarily unavailable. Please try again in a moment.');
  error.statusCode = 503;
  return error;
}

function matchesQuery(item, query) {
  return Object.entries(query).every(([key, value]) => item[key] === value);
}

async function readLocalRegistrations() {
  try {
    const contents = await fs.readFile(localStorePath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeLocalRegistrations(registrations) {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, `${JSON.stringify(registrations, null, 2)}\n`);
}

async function mirrorRegistrationLocally(registration) {
  if (!fileFallbackEnabled) return;

  try {
    const registrations = await readLocalRegistrations();
    const plain = registration.toObject ? registration.toObject() : registration;
    const mirrored = {
      ...plain,
      _id: String(plain._id),
      createdAt: new Date(plain.createdAt).toISOString(),
      updatedAt: new Date(plain.updatedAt).toISOString(),
    };
    const index = registrations.findIndex((item) => item.email === mirrored.email);

    if (index === -1) {
      registrations.push(mirrored);
    } else {
      registrations[index] = mirrored;
    }

    await writeLocalRegistrations(registrations);
  } catch (error) {
    console.error(`Unable to update local registration mirror for ${registration.email}:`, error.message);
  }
}

async function removeRegistrationLocally(id) {
  if (!fileFallbackEnabled) return;

  try {
    const registrations = await readLocalRegistrations();
    const remaining = registrations.filter((item) => String(item._id) !== String(id));
    if (remaining.length !== registrations.length) {
      await writeLocalRegistrations(remaining);
    }
  } catch (error) {
    console.error(`Unable to remove local registration mirror ${id}:`, error.message);
  }
}

function toLocalRegistration(data) {
  const now = new Date().toISOString();

  return {
    _id: crypto.randomUUID(),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    country: data.country || 'Ghana',
    church: data.church,
    churchRole: data.churchRole,
    attendanceType: data.attendanceType || 'ghana-center',
    paymentMethod: data.paymentMethod,
    momoReference: data.momoReference,
    momoTransactionId: data.momoTransactionId,
    status: data.status,
    paymentReviewedAt: data.paymentReviewedAt,
    createdAt: now,
    updatedAt: now,
  };
}

function toMongoRegistrationData(item) {
  return {
    fullName: item.fullName,
    email: item.email,
    phone: item.phone,
    country: item.country || 'Ghana',
    church: item.church,
    churchRole: item.churchRole,
    attendanceType: item.attendanceType || 'ghana-center',
    paymentMethod: item.paymentMethod,
    momoReference: item.momoReference,
    momoTransactionId: item.momoTransactionId,
    status: item.status,
    paymentReviewedAt: item.paymentReviewedAt,
  };
}

function sortNewestFirst(items) {
  return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function findOne(query) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    return Registration.findOne(query);
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  return registrations.find((item) => matchesQuery(item, query)) || null;
}

async function exists(query) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    return Registration.exists(query);
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  return registrations.some((item) => matchesQuery(item, query));
}

async function create(data) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    const registration = await Registration.create(data);
    await mirrorRegistrationLocally(registration);
    return registration;
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  const duplicate = registrations.some(
    (item) =>
      item.email === data.email ||
      (data.momoReference && item.momoReference === data.momoReference)
  );

  if (duplicate) {
    const error = new Error('Duplicate registration.');
    error.code = 11000;
    throw error;
  }

  const registration = toLocalRegistration(data);
  registrations.push(registration);
  await writeLocalRegistrations(registrations);
  return registration;
}

async function findAllNewestFirst() {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    return Registration.find().sort({ createdAt: -1 });
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  return sortNewestFirst(registrations);
}

async function findById(id) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    return Registration.findById(id);
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  return registrations.find((item) => String(item._id) === String(id)) || null;
}

async function updateById(id, updates) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    const registration = await Registration.findById(id);
    if (!registration) return null;

    Object.assign(registration, updates);
    await registration.save();
    await mirrorRegistrationLocally(registration);
    return registration;
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  const index = registrations.findIndex((item) => String(item._id) === String(id));
  if (index === -1) return null;

  if (updates.email) {
    const duplicate = registrations.some(
      (item, itemIndex) => itemIndex !== index && item.email === updates.email
    );
    if (duplicate) {
      const error = new Error('Duplicate registration.');
      error.code = 11000;
      throw error;
    }
  }

  registrations[index] = {
    ...registrations[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocalRegistrations(registrations);
  return registrations[index];
}

async function deleteById(id) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    const registration = await Registration.findByIdAndDelete(id);
    if (registration) {
      await removeRegistrationLocally(id);
    }
    return registration;
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  const index = registrations.findIndex((item) => String(item._id) === String(id));
  if (index === -1) return null;

  const [registration] = registrations.splice(index, 1);
  await writeLocalRegistrations(registrations);
  return registration;
}

async function submitMomoPayment({ email, momoReference, momoTransactionId }) {
  const mode = getStoreMode();
  if (mode === 'mongo') {
    const registration = await Registration.findOne({ email, momoReference });
    if (!registration) {
      return null;
    }
    if (registration.status === 'momo-paid') {
      const error = new Error('This payment has already been confirmed by an admin.');
      error.statusCode = 409;
      throw error;
    }

    registration.momoTransactionId = momoTransactionId.trim();
    registration.status = 'momo-review-pending';
    registration.paymentReviewedAt = null;
    await registration.save();
    await mirrorRegistrationLocally(registration);
    return registration;
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  const index = registrations.findIndex((item) => matchesQuery(item, { email, momoReference }));
  if (index === -1) {
    return null;
  }
  if (registrations[index].status === 'momo-paid') {
    const error = new Error('This payment has already been confirmed by an admin.');
    error.statusCode = 409;
    throw error;
  }

  registrations[index] = {
    ...registrations[index],
    momoTransactionId: momoTransactionId.trim(),
    status: 'momo-review-pending',
    paymentReviewedAt: null,
    updatedAt: new Date().toISOString(),
  };

  await writeLocalRegistrations(registrations);
  return registrations[index];
}

async function reviewPayment(id, decision) {
  if (!['confirmed', 'not-confirmed'].includes(decision)) {
    const error = new Error('Choose whether the payment was received or not received.');
    error.statusCode = 400;
    throw error;
  }

  const mode = getStoreMode();
  if (mode === 'mongo') {
    const registration = await Registration.findById(id);
    if (!registration) return null;

    if (decision === 'not-confirmed') {
      registration.status = 'payment-not-confirmed';
    } else {
      registration.status = 'momo-paid';
    }

    registration.paymentReviewedAt = new Date();
    await registration.save();
    await mirrorRegistrationLocally(registration);
    return registration;
  }
  if (mode === 'unavailable') {
    throw createUnavailableError();
  }

  const registrations = await readLocalRegistrations();
  const index = registrations.findIndex((item) => String(item._id) === String(id));
  if (index === -1) return null;

  registrations[index] = {
    ...registrations[index],
    status: decision === 'not-confirmed'
      ? 'payment-not-confirmed'
      : 'momo-paid',
    paymentReviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeLocalRegistrations(registrations);
  return registrations[index];
}

function confirmPayment(id) {
  return reviewPayment(id, 'confirmed');
}

async function runLocalSync() {
  if (mongoose.connection.readyState !== 1) {
    return { imported: 0, updated: 0, skipped: 0 };
  }

  const registrations = await readLocalRegistrations();
  const result = { imported: 0, updated: 0, skipped: 0 };

  for (const item of registrations) {
    try {
      const existing = await Registration.findOne({ email: item.email });
      if (!existing) {
        await Registration.create({
          ...toMongoRegistrationData(item),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        });
        result.imported += 1;
        continue;
      }

      const localUpdatedAt = new Date(item.updatedAt || item.createdAt || 0);
      const mongoUpdatedAt = new Date(existing.updatedAt || existing.createdAt || 0);
      if (localUpdatedAt > mongoUpdatedAt) {
        Object.assign(existing, toMongoRegistrationData(item));
        await existing.save();
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.skipped += 1;
      console.error(`Unable to sync local registration ${item.email}:`, error.message);
    }
  }

  return result;
}

async function syncLocalRegistrationsToMongo() {
  if (!syncPromise) {
    syncPromise = runLocalSync().finally(() => {
      syncPromise = null;
    });
  }

  return syncPromise;
}

module.exports = {
  create,
  deleteById,
  enableFileFallback,
  exists,
  findAllNewestFirst,
  findById,
  findOne,
  getStoreMode,
  confirmPayment,
  reviewPayment,
  submitMomoPayment,
  syncLocalRegistrationsToMongo,
  updateById,
};
