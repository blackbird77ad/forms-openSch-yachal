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

  const isMomo = form.paymentMethod === 'momo';
  const amountGhs = (USD_AMOUNT * USD_TO_GHS).toFixed(2);

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
      } else {
        setMessage('Registration saved. Please pay cash in person at the Ghana center when you arrive.');
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
    } catch (confirmError) {
      setError('Unable to connect to the server.');
      console.error(confirmError);
    } finally {
      setLoading(false);
    }
  };

  const copyReference = async () => {
    if (!registration?.momoReference) return;
    await navigator.clipboard.writeText(registration.momoReference);
    setMessage('Momo payment reference copied to clipboard.');
  };

  return (
    <div className="panel">
      <h2>Ghana-only registration</h2>
      <p>
        This registration is only for the Ghana approved center at Yachal House, Ridge Accra. If you are outside Ghana,
        visit <a href="https://osom.saintscommunity.net/" target="_blank" rel="noopener noreferrer">https://osom.saintscommunity.net/</a>.
      </p>
      <div className="note">
        <p>
          Payment via momo: <strong>{MOMO_NUMBER}</strong>. This fee is USD {USD_AMOUNT}, so the amount to send in cedis is shown below. Choose <strong>momo</strong> for online payment or <strong>cash</strong> for in-person payment.
        </p>
      </div>
      <div className="note">
        <p>
          Momo amount: <strong>₵{amountGhs}</strong> using the fixed rate <strong>1 USD = ₵{USD_TO_GHS.toFixed(2)}</strong>. Please send exactly this amount to {MOMO_NUMBER}.
        </p>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="note">{message}</div>}
      {confirmation && <div className="success">{confirmation}</div>}

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

      {isMomo && registration?.momoReference && (
        <div className="panel">
          <h2>Momo payment reference</h2>
          <p>Use this reference when sending momo payment to {MOMO_NUMBER}.</p>
          <div className="note">
            <strong>{registration.momoReference}</strong>
          </div>
          <div className="actions">
            <button className="action-button" type="button" onClick={copyReference}>
              Copy reference
            </button>
          </div>
          <div className="form-grid">
            <div className="full-width">
              <label htmlFor="transactionId">Momo Transaction ID</label>
              <input
                id="transactionId"
                name="transactionId"
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder="Paste the momo transaction ID here"
              />
            </div>
          </div>
          <div className="actions">
            <button className="action-button" type="button" onClick={handleConfirm} disabled={loading}>
              {loading ? 'Confirming...' : 'Submit transaction ID'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
