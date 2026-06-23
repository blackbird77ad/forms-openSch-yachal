import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? '' : 'http://localhost:4001');
const ADMIN_TOKEN_KEY = 'open-school-admin-token';
const ADMIN_VIEW_KEY = 'open-school-admin-view-v2';
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const PAGE_SIZE = 16;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function requestApi(path, options = {}, onRetry = () => {}) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (RETRYABLE_STATUSES.has(response.status) && attempt === 0) {
        onRetry();
        await wait(2000);
        continue;
      }
      return response;
    } catch (error) {
      window.clearTimeout(timeout);
      lastError = error;
      if (attempt === 0) {
        onRetry();
        await wait(2000);
        continue;
      }
    }
  }

  throw lastError || new Error('Unable to reach the server.');
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('The server returned an invalid response. Please refresh and try again.');
  }
}

function getPaymentState(status) {
  if (status === 'momo-paid') return 'paid';
  if (status === 'payment-not-confirmed') return 'not-paid';
  return 'yet-to-confirm';
}

function formatStatus(status) {
  const paymentState = getPaymentState(status);
  if (paymentState === 'paid') return 'Paid';
  if (paymentState === 'not-paid') return 'Not paid';
  return 'Yet to confirm';
}

function formatPaymentMethod(paymentMethod) {
  return paymentMethod === 'momo' ? 'Momo' : 'Payment method unavailable';
}

function formatSubmittedDate(value) {
  if (!value) return 'Date not available';
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminDashboard() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [registrations, setRegistrations] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [reviewingAction, setReviewingAction] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [loadingStatus, setLoadingStatus] = useState('');
  const [capabilities, setCapabilities] = useState({});
  const [viewType, setViewType] = useState(() => window.localStorage.getItem(ADMIN_VIEW_KEY) || 'list');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [emailStatus, setEmailStatus] = useState(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [resendingEmailId, setResendingEmailId] = useState('');

  const filteredRegistrations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const searchableFields = {
      name: (item) => item.fullName,
      email: (item) => item.email,
      church: (item) => item.church,
    };

    const filtered = registrations.filter((item) => {
      const matchesSearch = !query || (searchField === 'all'
        ? [item.fullName, item.email, item.church].some((value) => String(value || '').toLowerCase().includes(query))
        : String(searchableFields[searchField]?.(item) || '').toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || getPaymentState(item.status) === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'name') return String(a.fullName).localeCompare(String(b.fullName));
      if (sortBy === 'email') return String(a.email).localeCompare(String(b.email));
      if (sortBy === 'church') return String(a.church || '').localeCompare(String(b.church || ''));
      if (sortBy === 'status') return formatStatus(a.status).localeCompare(formatStatus(b.status));
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [registrations, searchTerm, searchField, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleRegistrations = filteredRegistrations.slice(pageStart, pageStart + PAGE_SIZE);

  const loadRegistrations = useCallback(async ({ silent = false } = {}) => {
    const adminToken = token.trim();
    if (!adminToken) {
      setError('Enter your admin token to load registrations.');
      return;
    }

    if (!silent) setLoading(true);
    setError('');
    if (!silent) {
      setMessage('');
      setLoadingStatus('Connecting to the registration database...');
    }

    const wakingTimer = window.setTimeout(() => {
      if (!silent) setLoadingStatus('The server is waking up. This can take up to a minute...');
    }, 5000);

    try {
      const response = await requestApi('/api/admin/registrations', {
        headers: { 'x-admin-token': adminToken },
      }, () => {
        if (!silent) setLoadingStatus('Retrying the server connection...');
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        setError(data.message || 'Unable to load registrations.');
        return;
      }

      const loadedRegistrations = Array.isArray(data.registrations) ? data.registrations : [];
      setRegistrations(loadedRegistrations);
      setStorage(data.storage || '');
      setCapabilities(data.capabilities || {});
      setEmailStatus(data.email || null);
      setHasLoaded(true);
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      const storageLabel = data.storage === 'file' ? 'local file storage' : data.storage === 'mongo' ? 'MongoDB' : 'storage';
      const databaseLabel = data.database ? ` (${data.database})` : '';
      setMessage(`Showing ${loadedRegistrations.length} registrations from ${storageLabel}${databaseLabel}.`);
    } catch (loadError) {
      setError(loadError.name === 'AbortError'
        ? 'The registration server took too long to respond. Please press Refresh registrations.'
        : loadError.message || 'Unable to reach the server.');
      console.error(loadError);
    } finally {
      window.clearTimeout(wakingTimer);
      if (!silent) {
        setLoading(false);
        setLoadingStatus('');
      }
    }
  }, [token]);

  useEffect(() => {
    if (!hasLoaded) return undefined;
    const interval = window.setInterval(() => {
      loadRegistrations({ silent: true });
    }, 60000);
    return () => window.clearInterval(interval);
  }, [hasLoaded, loadRegistrations]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, statusFilter, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const changeView = (nextView) => {
    setViewType(nextView);
    window.localStorage.setItem(ADMIN_VIEW_KEY, nextView);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSearchField('all');
    setStatusFilter('all');
    setSortBy('newest');
  };

  const testEmailNotifications = async () => {
    setTestingEmail(true);
    setError('');
    setMessage('');
    try {
      const response = await requestApi('/api/admin/email-test', {
        method: 'POST',
        headers: { 'x-admin-token': token.trim() },
      });
      const data = await readJsonResponse(response);
      setEmailStatus(data.email || null);
      if (!response.ok) {
        setError(data.message || 'Email test failed.');
        return;
      }
      setMessage(data.message || 'Test email sent to both administrators.');
    } catch (testError) {
      setError(testError.message || 'Unable to test email notifications.');
    } finally {
      setTestingEmail(false);
    }
  };

  const resendRegistrationEmails = async (registration) => {
    setResendingEmailId(registration._id);
    setError('');
    setMessage('');
    try {
      const response = await requestApi(`/api/admin/registrations/${registration._id}/resend-email`, {
        method: 'POST',
        headers: { 'x-admin-token': token.trim() },
      });
      const data = await readJsonResponse(response);
      setEmailStatus(data.email || emailStatus);
      if (!response.ok) {
        setError(data.message || 'Unable to resend emails.');
        return;
      }
      setMessage(data.message || `Emails resent for ${registration.fullName}.`);
    } catch (resendError) {
      setError(resendError.message || 'Unable to resend emails.');
    } finally {
      setResendingEmailId('');
    }
  };

  const reviewPayment = async (registration, decision) => {
    const isConfirmed = decision === 'confirmed';
    const paymentProof = registration.momoTransactionId
      ? `Momo transaction ID ${registration.momoTransactionId}`
      : `Momo reference ${registration.momoReference || 'not provided'}`;
    const shouldContinue = window.confirm(isConfirmed
      ? `Confirm that ${paymentProof} matches the Momo notification and reserve a slot for ${registration.fullName}?`
      : `Mark ${registration.fullName}'s payment as not received after checking ${paymentProof}? Their slot will not be reserved.`);
    if (!shouldContinue) return;

    setReviewingAction(`${registration._id}-${decision}`);
    setError('');
    setMessage('');

    try {
      const response = await requestApi(`/api/admin/registrations/${registration._id}/review-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token.trim(),
        },
        body: JSON.stringify({ decision }),
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        setError(data.message || 'Unable to review payment.');
        return;
      }

      setRegistrations((current) => current.map((item) => (
        item._id === data.registration._id ? data.registration : item
      )));
      if (data.email?.sent && isConfirmed) {
        setMessage(`${data.registration.fullName}'s payment is confirmed, their slot is reserved, and the email was sent.`);
      } else if (data.email?.sent) {
        setMessage(`${data.registration.fullName}'s payment was not confirmed and they were emailed with the Facilitator's contact number.`);
      } else {
        setError(`${data.message} Please contact ${data.registration.fullName} directly on ${data.registration.phone}.`);
      }
    } catch (reviewError) {
      setError('Unable to reach the server.');
      console.error(reviewError);
    } finally {
      setReviewingAction('');
    }
  };

  const deleteRegistration = async (registration) => {
    const shouldDelete = window.confirm(
      `Delete ${registration.fullName}'s registration? This cannot be undone.`
    );
    if (!shouldDelete) return;

    setDeletingId(registration._id);
    setError('');
    setMessage('');
    try {
      const response = await requestApi(`/api/admin/registrations/${registration._id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token.trim() },
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        setError(data.message || 'Unable to delete registration.');
        return;
      }

      setRegistrations((current) => current.filter((item) => item._id !== registration._id));
      setMessage(`${registration.fullName}'s registration was deleted.`);
    } catch (deleteError) {
      setError('Unable to reach the server.');
      console.error(deleteError);
    } finally {
      setDeletingId('');
    }
  };

  const exportCsv = async () => {
    if (!token) {
      setError('Enter your admin token before exporting.');
      return;
    }

    try {
      const response = await requestApi('/api/admin/export', {
        headers: { 'x-admin-token': token.trim() },
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Unable to export CSV.');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'registrations.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError('Unable to download CSV.');
      console.error(exportError);
    }
  };

  return (
    <div className="panel admin-panel">
      <h2>Admin dashboard</h2>
      <p>Use your admin token to load registrations and download the CSV export.</p>

      {error && <div className="alert">{error}</div>}
      {message && <div className="note">{message}</div>}
      {loadingStatus && <div className="note" role="status">{loadingStatus}</div>}
      {storage === 'file' && (
        <div className="storage-warning">
          The backend is using local file registration storage because MongoDB is not connected. New submissions can continue, but restore MongoDB as soon as possible for permanent storage.
        </div>
      )}

      <form className="form-grid two-col" onSubmit={(event) => { event.preventDefault(); loadRegistrations(); }}>
        <div>
          <label htmlFor="adminToken">Admin Token</label>
          <input id="adminToken" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter admin token" />
        </div>
      </form>

      <div className="actions">
        <button className="action-button" type="button" onClick={loadRegistrations} disabled={loading || !token}>
          {loading ? 'Loading...' : hasLoaded ? 'Refresh registrations' : 'Load registrations'}
        </button>
        <button className="secondary-button" type="button" onClick={exportCsv} disabled={!token}>
          Download CSV
        </button>
      </div>

      {hasLoaded && (
        <div className="registration-count" role="status">
          <strong>{registrations.length}</strong> registration{registrations.length === 1 ? '' : 's'} available
        </div>
      )}

      {hasLoaded && registrations.length > 0 && (
        <section className="admin-toolbar" aria-label="Registration search and display controls">
          <div className="admin-search-group">
            <label htmlFor="registrationSearch">Find a registration</label>
            <input
              id="registrationSearch"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Type a name, email or church"
            />
          </div>

          <details className="admin-filter-panel">
            <summary>Filters and sorting</summary>
            <div className="admin-filter-grid">
              <div>
                <label htmlFor="searchField">Search in</label>
                <select id="searchField" value={searchField} onChange={(event) => setSearchField(event.target.value)}>
                  <option value="all">Name, email or church</option>
                  <option value="name">Name only</option>
                  <option value="email">Email only</option>
                  <option value="church">Church only</option>
                </select>
              </div>
              <div>
                <label htmlFor="statusFilter">Payment status</label>
                <select id="statusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="yet-to-confirm">Yet to confirm</option>
                  <option value="paid">Paid</option>
                  <option value="not-paid">Not paid</option>
                </select>
              </div>
              <div>
                <label htmlFor="sortRegistrations">Sort registrations</label>
                <select id="sortRegistrations" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A-Z</option>
                  <option value="email">Email A-Z</option>
                  <option value="church">Church A-Z</option>
                  <option value="status">Status A-Z</option>
                </select>
              </div>
            </div>
          </details>

          <div className="toolbar-footer">
            <div className="view-toggle" role="group" aria-label="Choose registration view">
              <button className={viewType === 'grid' ? 'active' : ''} type="button" onClick={() => changeView('grid')}>Grid view</button>
              <button className={viewType === 'list' ? 'active' : ''} type="button" onClick={() => changeView('list')}>List view</button>
            </div>
            <button className="secondary-button clear-filters-button" type="button" onClick={clearFilters}>Clear search and filters</button>
          </div>
        </section>
      )}

      {hasLoaded && capabilities.emailDiagnostics && (
        <section className={`email-status-card ${emailStatus?.configured ? 'email-status-ready' : 'email-status-error'}`}>
          <div>
            <p className="email-status-label">Email notifications</p>
            <h3>{emailStatus?.configured ? 'Email service is configured' : 'Email service needs attention'}</h3>
            <p>
              Admin recipients: {emailStatus?.recipients?.join(', ') || 'Not available'}
            </p>
            {emailStatus?.lastSuccessAt && <p>Last successful email: {formatSubmittedDate(emailStatus.lastSuccessAt)}</p>}
            {emailStatus?.lastError && <p className="email-error-text">Last error: {emailStatus.lastError}</p>}
          </div>
          <button className="secondary-button" type="button" onClick={testEmailNotifications} disabled={testingEmail}>
            {testingEmail ? 'Sending test email...' : 'Send test email to admins'}
          </button>
        </section>
      )}

      {hasLoaded && registrations.length > 0 && (
        <div className="results-summary" role="status">
          Showing <strong>{filteredRegistrations.length}</strong> matching registration{filteredRegistrations.length === 1 ? '' : 's'}.
          {' '}Page {currentPage} of {totalPages}.
        </div>
      )}

      {hasLoaded && !loading && registrations.length === 0 && (
        <div className="empty-registrations">
          <h3>No registrations yet</h3>
          <p>New registrations will appear here after a form is submitted.</p>
        </div>
      )}

      {hasLoaded && registrations.length > 0 && filteredRegistrations.length === 0 && (
        <div className="empty-registrations">
          <h3>No matching registrations</h3>
          <p>Try clearing the search or choosing different filters.</p>
        </div>
      )}

      <div className={`registration-results registration-${viewType}`}>
        {visibleRegistrations.map((item, index) => {
          const paymentState = getPaymentState(item.status);
          const isPaid = paymentState === 'paid';
          const isRejected = paymentState === 'not-paid';
          const showPaymentReview = !isPaid;

          return (
            <article className={`registration-card ${isPaid ? 'registration-card-paid' : isRejected ? 'registration-card-rejected' : 'registration-card-pending'} ${showPaymentReview ? 'registration-card-reviewable' : ''}`} key={item._id}>
              <header className="registration-card-header">
                <div>
                  <p className="registration-number">Registration {pageStart + index + 1}</p>
                  <h3>{item.fullName}</h3>
                  <p className="submitted-date">Submitted {formatSubmittedDate(item.createdAt)}</p>
                </div>
                <span className={`status-pill ${isPaid ? 'status-paid' : isRejected ? 'status-rejected' : 'status-awaiting'}`}>
                  {formatStatus(item.status)}
                </span>
              </header>

              <div className="registration-details" aria-label={`${item.fullName}'s registration details`}>
                    <div className="registration-detail">
                      <span>Email address</span>
                      <strong>{item.email}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Phone number</span>
                      <strong>{item.phone}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Country</span>
                      <strong>{item.country || 'Ghana'}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Church</span>
                      <strong>{item.church || 'Not provided'}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Church role</span>
                      <strong>{item.churchRole || 'Not provided'}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Payment method</span>
                      <strong>{formatPaymentMethod(item.paymentMethod)}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Momo reference</span>
                      <strong>{item.momoReference || 'Not applicable'}</strong>
                    </div>
                    <div className="registration-detail">
                      <span>Transaction ID</span>
                      <strong>{item.momoTransactionId || 'Not submitted yet'}</strong>
                    </div>
              </div>

              {showPaymentReview && (
                <section className="payment-review-box" aria-label={`Review ${item.fullName}'s payment`}>
                      <div>
                        <h4>Compare the payment before changing the status</h4>
                        <p>
                          Match the Momo notification against reference {item.momoReference || 'not provided'}
                          {item.momoTransactionId ? ` and transaction ID ${item.momoTransactionId}` : ' and the registration details'}. Click Paid only when the payment is true.
                        </p>
                      </div>
                      <div className="payment-review-actions">
                        <button
                          className="action-button"
                          type="button"
                          onClick={() => reviewPayment(item, 'confirmed')}
                          disabled={Boolean(reviewingAction)}
                          title="Mark payment as paid and reserve the slot."
                        >
                          {reviewingAction === `${item._id}-confirmed` ? 'Saving...' : 'Paid'}
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => reviewPayment(item, 'not-confirmed')}
                          disabled={Boolean(reviewingAction)}
                        >
                          {reviewingAction === `${item._id}-not-confirmed` ? 'Saving...' : 'Not paid'}
                        </button>
                      </div>
                </section>
              )}

              <div className="registration-card-actions">
                    {capabilities.resendEmails && (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => resendRegistrationEmails(item)}
                        disabled={resendingEmailId === item._id}
                      >
                        {resendingEmailId === item._id ? 'Resending emails...' : 'Resend emails'}
                      </button>
                    )}
                    {capabilities.deleteRegistration && (
                      <button
                        className="danger-button delete-icon-button"
                        type="button"
                        onClick={() => deleteRegistration(item)}
                        disabled={deletingId === item._id}
                        aria-label={deletingId === item._id ? `Deleting ${item.fullName}` : `Delete ${item.fullName}'s registration`}
                        title="Delete registration"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" fill="currentColor" />
                        </svg>
                      </button>
                    )}
              </div>
            </article>
          );
        })}
      </div>

      {hasLoaded && filteredRegistrations.length > PAGE_SIZE && (
        <nav className="pagination" aria-label="Registration pages">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Previous page
          </button>
          <span>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
          >
            Next page
          </button>
        </nav>
      )}
    </div>
  );
}
