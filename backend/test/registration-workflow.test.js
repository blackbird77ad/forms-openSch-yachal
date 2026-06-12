const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');

const localStore = path.join(os.tmpdir(), `open-sch-yachal-${process.pid}.json`);
process.env.LOCAL_REGISTRATION_STORE = localStore;
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.RESEND_API_KEY = '';
process.env.RESEND_FROM_EMAIL = '';

const registrationStore = require('../services/registrationStore');
const registrationRoutes = require('../routes/registrations');
const adminRoutes = require('../routes/admin');
const emailNotifier = require('../services/emailNotifier');

registrationStore.enableFileFallback();

test('Momo registration waits for admin review before becoming paid', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/admin', adminRoutes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(localStore, { force: true });
  });

  const createdResponse = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Workflow Test',
      email: 'workflow@example.com',
      phone: '0200000000',
      country: 'Ghana',
      church: 'Yachal House',
      churchRole: 'Member',
      paymentMethod: 'momo',
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.registration.status, 'awaiting-momo-payment');

  const adminHeaders = { 'x-admin-token': process.env.ADMIN_TOKEN };
  const readResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}`,
    { headers: adminHeaders }
  );
  assert.equal(readResponse.status, 200);
  const read = await readResponse.json();
  assert.equal(read.registration.email, 'workflow@example.com');

  const updateResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}`,
    {
      method: 'PATCH',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Workflow Test Updated',
        email: 'WORKFLOW.UPDATED@example.com',
        phone: '0211111111',
        country: 'Ghana',
        church: 'Yachal House',
        churchRole: 'Leader',
      }),
    }
  );
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.registration.fullName, 'Workflow Test Updated');
  assert.equal(updated.registration.email, 'workflow.updated@example.com');
  assert.equal(updated.registration.churchRole, 'Leader');

  const protectedFieldResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}`,
    {
      method: 'PATCH',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'momo-paid' }),
    }
  );
  assert.equal(protectedFieldResponse.status, 400);

  const submittedResponse = await fetch(`${baseUrl}/api/registrations/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: updated.registration.email,
      momoReference: created.registration.momoReference,
      momoTransactionId: 'TEST-TXN-123',
    }),
  });
  assert.equal(submittedResponse.status, 200);
  const submitted = await submittedResponse.json();
  assert.equal(submitted.registration.status, 'momo-review-pending');

  const listResponse = await fetch(`${baseUrl}/api/admin/registrations`, { headers: adminHeaders });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.registrations.length, 1);
  assert.equal(list.registrations[0].momoTransactionId, 'TEST-TXN-123');

  const confirmResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}/confirm-payment`,
    { method: 'POST', headers: adminHeaders }
  );
  assert.equal(confirmResponse.status, 200);
  const confirmed = await confirmResponse.json();
  assert.equal(confirmed.registration.status, 'momo-paid');

  const duplicateConfirmResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}/confirm-payment`,
    { method: 'POST', headers: adminHeaders }
  );
  assert.equal(duplicateConfirmResponse.status, 409);

  const unauthorizedDeleteResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}`,
    { method: 'DELETE' }
  );
  assert.equal(unauthorizedDeleteResponse.status, 401);

  const deleteResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}`,
    { method: 'DELETE', headers: adminHeaders }
  );
  assert.equal(deleteResponse.status, 200);

  const missingResponse = await fetch(
    `${baseUrl}/api/admin/registrations/${created.registration._id}`,
    { headers: adminHeaders }
  );
  assert.equal(missingResponse.status, 404);

  const finalListResponse = await fetch(`${baseUrl}/api/admin/registrations`, { headers: adminHeaders });
  const finalList = await finalListResponse.json();
  assert.equal(finalList.registrations.length, 0);
});

test('emails target both admins and the applicant at each stage', async (t) => {
  const nativeFetch = global.fetch;
  const calls = [];
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_FROM_EMAIL = 'noreply@yachalhousegh.com';
  delete process.env.REGISTRATION_NOTIFICATION_EMAILS;

  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ id: `email-${calls.length}` }) };
  };

  t.after(() => {
    global.fetch = nativeFetch;
    process.env.RESEND_API_KEY = '';
    process.env.RESEND_FROM_EMAIL = '';
  });

  const registration = {
    _id: 'registration-id',
    fullName: 'Email Test',
    email: 'applicant@example.com',
    phone: '0200000000',
    church: 'Yachal House',
    churchRole: 'Member',
    paymentMethod: 'momo',
    momoReference: 'OpenSch-Yachal123',
    momoTransactionId: 'TXN-123',
    status: 'momo-review-pending',
  };

  await emailNotifier.sendRegistrationNotification(registration);
  await emailNotifier.sendApplicantRegistrationReceipt(registration);
  await emailNotifier.sendMomoPaymentReviewNotification(registration);
  await emailNotifier.sendApplicantPaymentReviewReceipt(registration);
  await emailNotifier.sendSlotConfirmation(registration);

  const admins = ['maamekrakuezoom@gmail.com', 'blackbird77ad@gmail.com'];
  assert.deepEqual(calls[0].body.to, admins);
  assert.deepEqual(calls[1].body.to, ['applicant@example.com']);
  assert.deepEqual(calls[2].body.to, admins);
  assert.deepEqual(calls[3].body.to, ['applicant@example.com']);
  assert.deepEqual(calls[4].body.to, ['applicant@example.com']);
  assert.ok(calls.every((call) => call.url === 'https://api.resend.com/emails'));
});

test('admin database check exercises create, read, update, and delete', async (t) => {
  const originalReadyState = mongoose.connection.readyState;
  const originalDb = mongoose.connection.db;
  let document = null;

  mongoose.connection.readyState = 1;
  mongoose.connection.db = {
    collection() {
      return {
        async insertOne(value) {
          document = { ...value };
          return { acknowledged: true };
        },
        async findOne(query) {
          return document && String(document._id) === String(query._id) ? { ...document } : null;
        },
        async updateOne(query, update) {
          if (!document || String(document._id) !== String(query._id)) return { modifiedCount: 0 };
          document = { ...document, ...update.$set };
          return { modifiedCount: 1 };
        },
        async deleteOne(query) {
          if (!document || String(document._id) !== String(query._id)) return { deletedCount: 0 };
          document = null;
          return { deletedCount: 1 };
        },
      };
    },
  };

  t.after(() => {
    mongoose.connection.readyState = originalReadyState;
    mongoose.connection.db = originalDb;
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/database-check`, {
    method: 'POST',
    headers: { 'x-admin-token': process.env.ADMIN_TOKEN },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.operations, {
    create: true,
    read: true,
    update: true,
    delete: true,
  });
  assert.equal(document, null);
});
