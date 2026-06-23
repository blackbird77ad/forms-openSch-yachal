const requiredRecipients = [
  'yachalhouse@gmail.com',
  'blackbird77ad@gmail.com',
  'akofuaquantson85@gmail.com',
];

const SUPPORT_PHONE = '0544600600';
const MOMO_ACCOUNT_LABEL = 'Yachal House Momo Number';
const PAYMENT_AMOUNT = 'GHS 250';
const REGISTRATION_DEADLINE = 'Sunday, June 28, 2026';
const FROM_EMAIL = 'Yachal House <noreply@yachalhousegh.com>';
const BRAND_COLORS = {
  green: '#15803d',
  purple: '#5b21b6',
  redwine: '#9f1239',
};
let warnedAboutMissingConfig = false;
let deliveryStatus = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  lastWebhookAt: null,
  lastWebhookType: null,
};

function getRecipients() {
  const configured = (process.env.REGISTRATION_NOTIFICATION_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  return [...new Set([...configured, ...requiredRecipients])];
}

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedAboutMissingConfig) {
      console.warn('Registration email notifications are disabled until RESEND_API_KEY is configured.');
      warnedAboutMissingConfig = true;
    }
    return null;
  }

  return { apiKey, from: FROM_EMAIL };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({ subject, lines, accent = 'purple' }) {
  const accentColor = BRAND_COLORS[accent] || BRAND_COLORS.purple;
  const content = lines.map((line) => {
    if (!line) {
      return '<div style="height:12px;line-height:12px">&nbsp;</div>';
    }
    return `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.65">${escapeHtml(line)}</p>`;
  }).join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:28px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">
            <tr>
              <td style="height:8px;background:linear-gradient(90deg,#15803d 0%,#5b21b6 54%,#9f1239 100%)"></td>
            </tr>
            <tr>
              <td style="padding:26px 28px 8px">
                <p style="margin:0 0 8px;color:${accentColor};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Yachal House Ghana Center</p>
                <h1 style="margin:0;color:#111827;font-size:24px;line-height:1.25">${escapeHtml(subject)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 8px">
                <div style="border-left:4px solid ${accentColor};background:#ffffff;padding:2px 0 2px 16px">
                  ${content}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px">
                  <p style="margin:0;color:#475569;font-size:13px;line-height:1.6">Open School of Ministry Ghana registration support</p>
                  <p style="margin:4px 0 0;color:#0f172a;font-size:15px;font-weight:700">0544600600</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function sendBrandedEmail({ to, subject, lines, idempotencyKey, accent }) {
  return sendEmail({
    to,
    subject,
    text: lines.join('\n'),
    html: buildEmailHtml({ subject, lines, accent }),
    idempotencyKey,
  });
}

async function sendEmail({ to, subject, text, html, idempotencyKey }) {
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
          html,
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

function recordWebhookEvent(event) {
  const eventType = event?.type || 'unknown';
  deliveryStatus.lastWebhookAt = new Date().toISOString();
  deliveryStatus.lastWebhookType = eventType;

  if (['email.delivered', 'email.sent'].includes(eventType)) {
    deliveryStatus.lastSuccessAt = deliveryStatus.lastWebhookAt;
    deliveryStatus.lastError = null;
  }

  if (['email.failed', 'email.bounced', 'email.complained', 'email.suppressed'].includes(eventType)) {
    deliveryStatus.lastFailureAt = deliveryStatus.lastWebhookAt;
    deliveryStatus.lastError = event?.data?.last_event || eventType;
  }
}

function sendAdminTestEmail() {
  return sendBrandedEmail({
    to: getRecipients(),
    subject: 'Open School email notifications are working',
    idempotencyKey: `admin-email-test-${Date.now()}`,
    accent: 'green',
    lines: [
      'This is a test from the Open School of Ministry Ghana registration system.',
      '',
      'Admin email notifications are working correctly.',
      `Emails are sent from ${FROM_EMAIL}.`,
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ],
  });
}

function registrationDetails(registration) {
  return [
    `Name: ${registration.fullName}`,
    `Email: ${registration.email}`,
    `Phone: ${registration.phone}`,
    `Church: ${registration.church}`,
    `Church role: ${registration.churchRole}`,
    `Registration deadline: ${REGISTRATION_DEADLINE}`,
    'Payment method: Momo',
    `Payment amount: ${PAYMENT_AMOUNT}`,
    `${MOMO_ACCOUNT_LABEL}: ${SUPPORT_PHONE}`,
    `Payment status: ${registration.status}`,
    `Momo reference: ${registration.momoReference || 'Not applicable'}`,
    `Momo transaction ID: ${registration.momoTransactionId || 'Not submitted'}`,
  ];
}

function createIdempotencyKey(base, options = {}) {
  return options.force ? `${base}-resend-${Date.now()}` : base;
}

function sendRegistrationNotification(registration, options) {
  return sendBrandedEmail({
    to: getRecipients(),
    subject: `New registration: ${registration.fullName}`,
    idempotencyKey: createIdempotencyKey(`registration-admin-${registration._id}`, options),
    accent: 'purple',
    lines: [
      'A new Open School of Ministry Ghana registration was submitted.',
      '',
      ...registrationDetails(registration),
      '',
      'Review registrations in the admin dashboard.',
    ],
  });
}

function sendApplicantRegistrationReceipt(registration, options) {
  const paymentSummary = `We received your Momo payment submission for ${PAYMENT_AMOUNT} to the ${MOMO_ACCOUNT_LABEL}: ${SUPPORT_PHONE}. Your reference is ${registration.momoReference} and your submitted transaction ID is ${registration.momoTransactionId || 'not provided'}. Admins will match both details before confirming your slot.`;

  return sendBrandedEmail({
    to: registration.email,
    subject: 'Your Open School of Ministry registration was received',
    idempotencyKey: createIdempotencyKey(`registration-applicant-${registration._id}`, options),
    accent: 'purple',
    lines: [
      `Hello ${registration.fullName},`,
      '',
      'Your Open School of Ministry Ghana registration and Momo transaction ID have been received.',
      `Registration deadline: ${REGISTRATION_DEADLINE}.`,
      paymentSummary,
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ],
  });
}

function sendMomoPaymentReviewNotification(registration, options) {
  return sendBrandedEmail({
    to: getRecipients(),
    subject: `Momo payment awaiting review: ${registration.fullName}`,
    idempotencyKey: createIdempotencyKey(`payment-review-admin-${registration._id}-${registration.momoTransactionId}`, options),
    accent: 'redwine',
    lines: [
      'A Momo transaction ID has been submitted and requires admin review.',
      '',
      ...registrationDetails(registration),
      '',
      'Confirm the payment in the admin dashboard only after verifying that the payment was received.',
    ],
  });
}

function sendApplicantPaymentReviewReceipt(registration, options) {
  return sendBrandedEmail({
    to: registration.email,
    subject: 'Your Momo payment is awaiting review',
    idempotencyKey: createIdempotencyKey(`payment-review-applicant-${registration._id}-${registration.momoTransactionId}`, options),
    accent: 'purple',
    lines: [
      `Hello ${registration.fullName},`,
      '',
      'Your form and Momo transaction ID were submitted successfully.',
      'An admin will review your payment by matching the reference code and transaction ID. After it is confirmed, you will receive another email confirming your slot.',
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ],
  });
}

function sendSlotConfirmation(registration, options) {
  return sendBrandedEmail({
    to: registration.email,
    subject: 'Your Open School of Ministry slot is confirmed',
    idempotencyKey: createIdempotencyKey(`slot-confirmed-${registration._id}`, options),
    accent: 'green',
    lines: [
      `Hello ${registration.fullName},`,
      '',
      'Your payment confirmation was successful, and your slot for the Open School of Ministry Ghana center is reserved.',
      'The Ghana center is at Yachal House, Ridge Accra.',
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ],
  });
}

function sendPaymentNotConfirmed(registration, options) {
  const paymentDescription = registration.momoTransactionId
    ? `Momo transaction ID ${registration.momoTransactionId}`
    : `Momo reference ${registration.momoReference || 'not provided'}`;

  return sendBrandedEmail({
    to: registration.email,
    subject: 'Payment unsuccessful - action required',
    idempotencyKey: createIdempotencyKey(`payment-not-confirmed-${registration._id}`, options),
    accent: 'redwine',
    lines: [
      `Hello ${registration.fullName},`,
      '',
      `We could not verify your payment using ${paymentDescription}, so your payment confirmation was unsuccessful. Your slot has not been reserved.`,
      `Please contact the Facilitator on ${SUPPORT_PHONE} with further payment evidence, your Momo proof, or the correct transaction details.`,
      '',
      `For assistance, contact ${SUPPORT_PHONE}.`,
    ],
  });
}

module.exports = {
  getEmailStatus,
  recordWebhookEvent,
  sendApplicantPaymentReviewReceipt,
  sendApplicantRegistrationReceipt,
  sendAdminTestEmail,
  sendMomoPaymentReviewNotification,
  sendRegistrationNotification,
  sendPaymentNotConfirmed,
  sendSlotConfirmation,
};
