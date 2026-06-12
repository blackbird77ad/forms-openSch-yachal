const defaultRecipients = [
  'maamekrakuezoom@gmail.com',
  'blackbird77ad@gmail.com',
];

const SUPPORT_PHONE = '0544600600';
let warnedAboutMissingConfig = false;
let deliveryStatus = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
};

function getRecipients() {
  const configured = (process.env.REGISTRATION_NOTIFICATION_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : defaultRecipients;
}

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    if (!warnedAboutMissingConfig) {
      console.warn('Registration email notifications are disabled until RESEND_API_KEY and RESEND_FROM_EMAIL are configured.');
      warnedAboutMissingConfig = true;
    }
    return null;
  }

  return { apiKey, from };
}

async function sendEmail({ to, subject, text, idempotencyKey }) {
  const config = getConfig();
  deliveryStatus.lastAttemptAt = new Date().toISOString();
  if (!config) {
    deliveryStatus.lastFailureAt = deliveryStatus.lastAttemptAt;
    deliveryStatus.lastError = 'Email service is not configured.';
    return { sent: false, reason: 'not-configured' };
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: Array.isArray(to) ? to : [to],
          subject,
          text,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        deliveryStatus.lastSuccessAt = new Date().toISOString();
        deliveryStatus.lastError = null;
        return { sent: true, id: data.id, attempts: attempt };
      }

      lastError = new Error(data.message || `Resend returned HTTP ${response.status}.`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  deliveryStatus.lastFailureAt = new Date().toISOString();
  deliveryStatus.lastError = lastError?.message || 'Unknown email delivery error.';
  throw lastError || new Error(deliveryStatus.lastError);
}

function getEmailStatus() {
  const config = getConfig();
  return {
    configured: Boolean(config),
    from: config?.from || null,
    recipients: getRecipients(),
    ...deliveryStatus,
  };
}

function sendAdminTestEmail() {
  return sendEmail({
    to: getRecipients(),
    subject: 'Open School email notifications are working',
    idempotencyKey: `admin-email-test-${Date.now()}`,
    text: [
      'This is a test from the Open School of Ministry Ghana registration system.',
      '',
      'Admin email notifications are working correctly.',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ].join('\n'),
  });
}

function registrationDetails(registration) {
  return [
    `Name: ${registration.fullName}`,
    `Email: ${registration.email}`,
    `Phone: ${registration.phone}`,
    `Church: ${registration.church}`,
    `Church role: ${registration.churchRole}`,
    `Payment method: ${registration.paymentMethod}`,
    `Payment status: ${registration.status}`,
    `Momo reference: ${registration.momoReference || 'Not applicable'}`,
    `Momo transaction ID: ${registration.momoTransactionId || 'Not submitted'}`,
  ];
}

function createIdempotencyKey(base, options = {}) {
  return options.force ? `${base}-resend-${Date.now()}` : base;
}

function sendRegistrationNotification(registration, options) {
  return sendEmail({
    to: getRecipients(),
    subject: `New registration: ${registration.fullName}`,
    idempotencyKey: createIdempotencyKey(`registration-admin-${registration._id}`, options),
    text: [
      'A new Open School of Ministry Ghana registration was submitted.',
      '',
      ...registrationDetails(registration),
      '',
      'Review registrations in the admin dashboard.',
    ].join('\n'),
  });
}

function sendApplicantRegistrationReceipt(registration, options) {
  const paymentInstructions = registration.paymentMethod === 'momo'
    ? `Complete the Momo payment to ${SUPPORT_PHONE} using reference ${registration.momoReference}, then submit your transaction ID on the registration page.`
    : 'Your registration has been received. Please pay cash in person at the Ghana center.';

  return sendEmail({
    to: registration.email,
    subject: 'Your Open School of Ministry registration was received',
    idempotencyKey: createIdempotencyKey(`registration-applicant-${registration._id}`, options),
    text: [
      `Hello ${registration.fullName},`,
      '',
      'Your Open School of Ministry Ghana registration has been received.',
      paymentInstructions,
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ].join('\n'),
  });
}

function sendMomoPaymentReviewNotification(registration, options) {
  return sendEmail({
    to: getRecipients(),
    subject: `Momo payment awaiting review: ${registration.fullName}`,
    idempotencyKey: createIdempotencyKey(`payment-review-admin-${registration._id}-${registration.momoTransactionId}`, options),
    text: [
      'A Momo transaction ID has been submitted and requires admin review.',
      '',
      ...registrationDetails(registration),
      '',
      'Confirm the payment in the admin dashboard only after verifying that the payment was received.',
    ].join('\n'),
  });
}

function sendApplicantPaymentReviewReceipt(registration, options) {
  return sendEmail({
    to: registration.email,
    subject: 'Your Momo payment is awaiting review',
    idempotencyKey: createIdempotencyKey(`payment-review-applicant-${registration._id}-${registration.momoTransactionId}`, options),
    text: [
      `Hello ${registration.fullName},`,
      '',
      'Your form and Momo transaction ID were submitted successfully.',
      'An admin will review your payment. After it is confirmed, you will receive another email confirming your slot.',
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ].join('\n'),
  });
}

function sendSlotConfirmation(registration, options) {
  return sendEmail({
    to: registration.email,
    subject: 'Your Open School of Ministry slot is confirmed',
    idempotencyKey: createIdempotencyKey(`slot-confirmed-${registration._id}`, options),
    text: [
      `Hello ${registration.fullName},`,
      '',
      'Your payment has been confirmed and your slot for the Open School of Ministry Ghana center is reserved.',
      'The Ghana center is at Yachal House, Ridge Accra.',
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ].join('\n'),
  });
}

function sendPaymentNotConfirmed(registration, options) {
  const paymentDescription = registration.paymentMethod === 'momo'
    ? `Momo payment with transaction ID ${registration.momoTransactionId || 'not provided'}`
    : 'cash payment';

  return sendEmail({
    to: registration.email,
    subject: 'Payment not confirmed - action required',
    idempotencyKey: createIdempotencyKey(`payment-not-confirmed-${registration._id}`, options),
    text: [
      `Hello ${registration.fullName},`,
      '',
      `We could not confirm your ${paymentDescription}. Your slot has not been reserved yet.`,
      'Please send your payment proof or Momo transaction ID and contact the Facilitator on 0544600600.',
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ].join('\n'),
  });
}

module.exports = {
  getEmailStatus,
  sendApplicantPaymentReviewReceipt,
  sendApplicantRegistrationReceipt,
  sendAdminTestEmail,
  sendMomoPaymentReviewNotification,
  sendRegistrationNotification,
  sendPaymentNotConfirmed,
  sendSlotConfirmation,
};
