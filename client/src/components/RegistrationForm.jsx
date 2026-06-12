import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4001';
const MOMO_NUMBER = '0544600600';
const USD_AMOUNT = 20;
const USD_TO_GHS = 11.14;

export default function RegistrationForm() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    country: 'Ghana',
    churchSelection: 'yachal-house',
    otherChurchDetails: '',
    churchRole: 'Member',
    paymentMethod: 'momo',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [registration, setRegistration] = useState(null);
  const [transactionId, setTransactionId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [step, setStep] = useState('form');
  const [copyStatus, setCopyStatus] = useState('idle');

  const isMomo = registration ? registration.paymentMethod === 'momo' : form.paymentMethod === 'momo';
  const amountGhs = (USD_AMOUNT * USD_TO_GHS).toFixed(2);
  const activeStep = step === 'form' ? 1 : step === 'payment' ? 2 : 3;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setConfirmation('');

    try {
      const church = form.churchSelection === 'yachal-house' ? 'Yachal House' : form.otherChurchDetails.trim();
      if (form.churchSelection === 'other' && !church) {
        setError('Please enter your church name and location in Ghana.');
        setLoading(false);
        return;
      }

      const requestBody = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        country: form.country,
        church,
        churchRole: form.churchRole,
        paymentMethod: form.paymentMethod,
      };

      const response = await fetch(`${API_BASE}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Unable to create registration.');
        return;
      }

      setRegistration(data.registration);
      if (data.registration.paymentMethod === 'momo') {
        setMessage('Your momo payment reference has been generated below. Please copy it and use it as the momo reference when you pay.');
        setStep('payment');
      } else {
        setMessage('Registration saved. Please pay cash in person at the Ghana center when you arrive.');
        setStep('complete');
      }
    } catch (submitError) {
      setError('Unable to connect to the server.');
      console.error(submitError);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!transactionId.trim()) {
      setError('Please enter the momo transaction ID after payment.');
      return;
    }

    setLoading(true);
    setError('');
    setConfirmation('');

    try {
      const response = await fetch(`${API_BASE}/api/registrations/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registration.email,
          momoReference: registration.momoReference,
          momoTransactionId: transactionId.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Unable to confirm momo payment.');
        return;
      }

      setConfirmation('Payment confirmed. Your registration is now complete.');
      setRegistration(data.registration);
      setStep('complete');
    } catch (confirmError) {
      setError('Unable to connect to the server.');
      console.error(confirmError);
    } finally {
      setLoading(false);
    }
  };

  const copyReference = async () => {
    if (!registration?.momoReference) return;

    try {
      await navigator.clipboard.writeText(registration.momoReference);
      setCopyStatus('copied');
      setError('');
      window.setTimeout(() => setCopyStatus('idle'), 3000);
    } catch (copyError) {
      setCopyStatus('error');
      setError('Unable to copy automatically. Press and hold the reference to copy it manually.');
      console.error(copyError);
    }
  };

  return (
    <div className="panel">
      <div className="progress-steps" aria-label={`Registration progress: step ${activeStep} of 3`}>
        {['Registration', 'Payment', 'Confirmation'].map((label, index) => {
          const stepNumber = index + 1;
          const state = stepNumber < activeStep ? 'complete' : stepNumber === activeStep ? 'active' : '';
          return (
            <div className={`progress-step ${state}`} key={label}>
              <span className="step-number">{stepNumber}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {step === 'form' && (
        <>
          <h2>Ghana-only registration</h2>
          <p>
            This registration is only for the Ghana approved center at Yachal House, Ridge Accra. If you are outside Ghana,
            visit <a href="https://osom.saintscommunity.net/" target="_blank" rel="noopener noreferrer">https://osom.saintscommunity.net/</a>.
          </p>
          <div className="note">
            <p>
              Payment via Momo: <strong>{MOMO_NUMBER}</strong>. This fee is USD {USD_AMOUNT}, so the amount to send in cedis is shown below. Choose <strong>Momo</strong> for online payment or <strong>cash</strong> for in-person payment.
            </p>
          </div>
          <div className="note">
            <p>
              Momo amount: <strong>GHS {amountGhs}</strong> using the current rate <strong>1 USD = GHS {USD_TO_GHS.toFixed(2)}</strong>. Make payment to {MOMO_NUMBER} to secure your spot, then submit the Momo transaction ID after payment. If you choose cash, please pay in person at the Ghana center when you arrive.
            </p>
          </div>
        </>
      )}

      {error && <div className="alert">{error}</div>}
      {message && <div className="note">{message}</div>}
      {confirmation && <div className="success">{confirmation}</div>}

      {step === 'form' && (
        <form onSubmit={handleSubmit} className="form-grid two-col">
          <div>
            <label htmlFor="fullName">Full Name</label>
            <input id="fullName" name="fullName" value={form.fullName} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="email">Email Address</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="phone">Phone Number</label>
            <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="country">Country</label>
            <input id="country" name="country" value={form.country} readOnly />
          </div>
          <div>
            <label htmlFor="churchSelection">Church</label>
            <select id="churchSelection" name="churchSelection" value={form.churchSelection} onChange={handleChange} required>
              <option value="yachal-house">Yachal House</option>
              <option value="other">Other church in Ghana</option>
            </select>
          </div>
          {form.churchSelection === 'other' && (
            <div className="full-width">
              <label htmlFor="otherChurchDetails">Other church name and location in Ghana</label>
              <input
                id="otherChurchDetails"
                name="otherChurchDetails"
                value={form.otherChurchDetails}
                onChange={handleChange}
                placeholder="e.g. Calvary Chapel, Tema"
                required
              />
            </div>
          )}
          <div>
            <label htmlFor="churchRole">Your role in the church</label>
            <select id="churchRole" name="churchRole" value={form.churchRole} onChange={handleChange} required>
              <option value="Pastor">Pastor</option>
              <option value="Church worker">Church worker</option>
              <option value="Leader">Leader</option>
              <option value="Member">Member</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="paymentMethod">Payment Method</label>
            <select id="paymentMethod" name="paymentMethod" value={form.paymentMethod} onChange={handleChange} required>
              <option value="momo">Momo</option>
              <option value="cash">Cash (in person)</option>
            </select>
          </div>

          <div className="actions full-width">
            <button className="action-button" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save and continue'}
            </button>
          </div>
        </form>
      )}

      {step === 'payment' && isMomo && registration?.momoReference && (
        <div className="next-step payment-section">
          <div className="payment-heading">
            <p className="eyebrow">Step 2 of 3</p>
            <h2>Complete your Momo payment</h2>
            <p>Follow all three instructions below so we can match your payment to your registration.</p>
          </div>

          <ol className="payment-guide">
            <li className="payment-guide-card">
              <span className="guide-number">1</span>
              <div>
                <h3>Copy your payment reference</h3>
                <p>You must use this exact reference as the payment reference when sending the Momo payment.</p>
                <div className={`reference-box ${copyStatus === 'copied' ? 'copied' : ''}`}>
                  <strong>{registration.momoReference}</strong>
                  <button
                    className={`action-button copy-button ${copyStatus === 'copied' ? 'copied' : ''}`}
                    type="button"
                    onClick={copyReference}
                    aria-live="polite"
                  >
                    {copyStatus === 'copied' ? 'Copied successfully' : 'Copy reference'}
                  </button>
                </div>
                {copyStatus === 'copied' && (
                  <p className="copy-success" role="status">Reference copied. Paste it into the Momo payment reference field.</p>
                )}
              </div>
            </li>

            <li className="payment-guide-card">
              <span className="guide-number">2</span>
              <div>
                <h3>Make the Momo payment</h3>
                <p>
                  Send <strong>GHS {amountGhs}</strong> to <strong>{MOMO_NUMBER}</strong>. When asked for a reference,
                  paste <strong>{registration.momoReference}</strong> so your payment can be identified.
                </p>
                <div className="payment-summary">
                  <span>Momo number <strong>{MOMO_NUMBER}</strong></span>
                  <span>Amount <strong>GHS {amountGhs}</strong></span>
                </div>
              </div>
            </li>

            <li className="payment-guide-card">
              <span className="guide-number">3</span>
              <div>
                <h3>Submit the transaction ID</h3>
                <p>After the payment goes through, Momo will give you a transaction ID. Enter that ID below and submit it to confirm that you have paid.</p>
                <label htmlFor="transactionId">Momo Transaction ID</label>
                <input
                  id="transactionId"
                  name="transactionId"
                  value={transactionId}
                  onChange={(event) => setTransactionId(event.target.value)}
                  placeholder="Enter the transaction ID from Momo"
                />
                <button className="action-button payment-submit" type="button" onClick={handleConfirm} disabled={loading}>
                  {loading ? 'Submitting payment...' : 'I have paid - submit transaction ID'}
                </button>
                <p className="submit-note">Only submit after the payment has gone through successfully.</p>
              </div>
            </li>
          </ol>
        </div>
      )}

      {step === 'complete' && registration && (
        <div className="next-step">
          <h2>Registration saved</h2>
          <p>
            Thank you, {registration.fullName}. Your registration for the Ghana center at Yachal House, Ridge Accra has been saved.
          </p>
          <div className="note">
            {registration.paymentMethod === 'cash'
              ? 'Please pay cash in person at the Ghana center when you arrive.'
              : 'Your momo payment has been submitted and marked as paid.'}
          </div>
        </div>
      )}
    </div>
  );
}
