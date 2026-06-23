const crypto = require('crypto');
const express = require('express');
const { recordWebhookEvent } = require('../services/emailNotifier');

const router = express.Router();
const RESEND_EMAIL_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.failed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
]);

function getSigningSecret() {
  return (process.env.RESEND_WEBHOOK_SECRET || '').trim();
}

function getSecretBytes(secret) {
  const normalizedSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(normalizedSecret, 'base64');
}

function getSignatureValues(signatureHeader) {
  return String(signatureHeader || '')
    .split(/\s+/)
    .flatMap((part) => {
      const [version, signature] = part.split(',');
      return version === 'v1' && signature ? [signature] : [];
    });
}

function timingSafeEqualBase64(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookSignature({ rawBody, headers, secret = getSigningSecret() }) {
  if (!secret) {
    return { ok: true, skipped: true };
  }

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const signatures = getSignatureValues(headers['svix-signature']);

  if (!svixId || !svixTimestamp || signatures.length === 0) {
    return { ok: false, reason: 'missing-signature-headers' };
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', getSecretBytes(secret))
    .update(signedPayload)
    .digest('base64');

  const verified = signatures.some((signature) => timingSafeEqualBase64(signature, expectedSignature));
  return verified ? { ok: true, skipped: false } : { ok: false, reason: 'invalid-signature' };
}

router.get('/', (req, res) => {
  res.json({
    message: 'Resend webhook endpoint is ready.',
    verifiesSignatures: Boolean(getSigningSecret()),
    supportedEvents: [...RESEND_EMAIL_EVENTS],
  });
});

router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const verification = verifyWebhookSignature({ rawBody, headers: req.headers });

  if (!verification.ok) {
    return res.status(400).json({ message: 'Invalid Resend webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: 'Invalid Resend webhook payload.' });
  }

  recordWebhookEvent(event);
  const eventType = event?.type || 'unknown';
  const emailId = event?.data?.email_id || event?.data?.id || 'unknown';
  console.log(`Received Resend webhook event: ${eventType} (${emailId})`);

  return res.json({
    received: true,
    eventType,
    signatureVerified: !verification.skipped,
  });
});

module.exports = {
  RESEND_EMAIL_EVENTS,
  router,
  verifyWebhookSignature,
};
