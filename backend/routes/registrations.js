const express = require('express');
const registrationStore = require('../services/registrationStore');
const {
  sendApplicantPaymentReviewReceipt,
  sendApplicantRegistrationReceipt,
  sendMomoPaymentReviewNotification,
  sendRegistrationNotification,
} = require('../services/emailNotifier');
const { generateOrReuseReference } = require('../utils/reference');

const router = express.Router();

function sendStorageError(res, error, fallbackMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: 'Email or momo reference already exists.' });
  }

  console.error(error);
  return res.status(500).json({ message: fallbackMessage });
}

async function sendNotifications(notifications, context) {
  const results = await Promise.allSettled(notifications.map((notification) => notification()));
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error(`Unable to send ${context} email:`, result.reason.message);
    }
  });
  return results.map((result) => ({
    sent: result.status === 'fulfilled' && result.value?.sent === true,
    reason: result.status === 'rejected' ? result.reason.message : result.value?.reason || null,
  }));
}

router.post('/', async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      country = 'Ghana',
      church,
      churchRole,
      attendanceType = 'ghana-center',
      paymentMethod = 'momo',
    } = req.body;

    if (!fullName || !email || !phone || !church || !churchRole) {
      return res.status(400).json({ message: 'Name, email, phone, church, and church role are required.' });
    }
    if (paymentMethod !== 'momo') {
      return res.status(400).json({ message: 'Only Momo payment is accepted for this registration.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await registrationStore.findOne({ email: normalizedEmail });

    if (existing) {
      if (existing.paymentMethod === 'momo' && existing.status === 'awaiting-momo-payment') {
        const notificationResults = await sendNotifications([
          () => sendRegistrationNotification(existing),
          () => sendApplicantRegistrationReceipt(existing),
        ], 'existing registration');
        return res.status(200).json({
          message: 'A momo payment reference already exists for this email.',
          registration: existing,
          notifications: {
            admins: notificationResults[0],
            applicant: notificationResults[1],
          },
        });
      }
      return res.status(409).json({ message: 'This email is already registered.' });
    }

    const momoReference = await generateOrReuseReference(normalizedEmail);
    const status = 'awaiting-momo-payment';

    const registration = await registrationStore.create({
      fullName,
      email: normalizedEmail,
      phone,
      country,
      church,
      churchRole,
      attendanceType,
      paymentMethod: 'momo',
      momoReference,
      status,
    });

    const notificationResults = await sendNotifications([
      () => sendRegistrationNotification(registration),
      () => sendApplicantRegistrationReceipt(registration),
    ], 'registration');

    res.status(201).json({
      message: 'Registration created.',
      registration,
      notifications: {
        admins: notificationResults[0],
        applicant: notificationResults[1],
      },
    });
  } catch (error) {
    sendStorageError(res, error, 'Unable to save registration.');
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const { email, momoReference, momoTransactionId } = req.body;
    if (!email || !momoReference || !momoTransactionId) {
      return res.status(400).json({ message: 'Email, momo reference, and transaction ID are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const registration = await registrationStore.submitMomoPayment({
      email: normalizedEmail,
      momoReference,
      momoTransactionId,
    });
    if (!registration) {
      return res.status(404).json({ message: 'Could not find matching registration.' });
    }

    const notificationResults = await sendNotifications([
      () => sendMomoPaymentReviewNotification(registration),
      () => sendApplicantPaymentReviewReceipt(registration),
    ], 'payment review');

    res.status(200).json({
      message: 'Form submitted successfully. Your payment is awaiting admin review.',
      registration,
      notifications: {
        admins: notificationResults[0],
        applicant: notificationResults[1],
      },
    });
  } catch (error) {
    sendStorageError(res, error, 'Unable to confirm momo payment.');
  }
});

module.exports = router;
