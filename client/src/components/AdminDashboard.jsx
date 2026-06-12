import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.PROD ? '' : import.meta.env.VITE_API_BASE || 'http://localhost:4001';
const ADMIN_TOKEN_KEY = 'open-school-admin-token';
const ADMIN_VIEW_KEY = 'open-school-admin-view';
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

function formatStatus(status) {
  if (status === 'awaiting-momo-payment') return 'Awaiting momo payment';
  if (status === 'momo-review-pending') return 'Momo awaiting admin review';
  if (status === 'momo-paid') return 'Momo paid';
  if (status === 'cash-pending') return 'Cash pending';
  if (status === 'cash-paid') return 'Cash paid';
  return status;
}

function formatPaymentMethod(paymentMethod) {
  return paymentMethod === 'momo' ? 'Mobile Money (Momo)' : 'Cash payment';
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
  const [confirmingId, setConfirmingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [capabilities, setCapabilities] = useState({});
  const [viewType, setViewType] = useState(() => window.localStorage.getItem(ADMIN_VIEW_KEY) || 'grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);

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
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesPayment = paymentFilter === 'all' || item.paymentMethod === paymentFilter;
      return matchesSearch && matchesStatus && matchesPayment;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'name') return String(a.fullName).localeCompare(String(b.fullName));
      if (sortBy === 'email') return String(a.email).localeCompare(String(b.email));
      if (sortBy === 'church') return String(a.church || '').localeCompare(String(b.church || ''));
      if (sortBy === 'status') return String(a.status).localeCompare(String(b.status));
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [registrations, searchTerm, searchField, statusFilter, paymentFilter, sortBy]);

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
  }, [searchTerm, searchField, statusFilter, paymentFilter, sortBy]);

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
    setPaymentFilter('all');
    setSortBy('newest');
  };

  const confirmPayment = async (registration) => {
    setConfirmingId(registration._id);
    setError('');
    setMessage('');

    try {
      const response = await requestApi(`/api/admin/registrations/${registration._id}/confirm-payment`, {
        method: 'POST',
        headers: { 'x-admin-token': token.trim() },
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        setError(data.message || 'Unable to confirm payment.');
        return;
      }

      setRegistrations((current) => current.map((item) => (
        item._id === data.registration._id ? data.registration : item
      )));
      if (data.email?.sent) {
        setMessage(`${data.registration.fullName}'s payment is confirmed and their slot confirmation email was sent.`);
      } else {
        setError(`${data.registration.fullName}'s payment is confirmed, but the email was not sent. Please contact them directly.`);
      }
    } catch (confirmError) {
      setError('Unable to reach the server.');
      console.error(confirmError);
    } finally {
      setConfirmingId('');
    }
  };

  const startEdit = (registration) => {
    setEditingId(registration._id);
    setEditForm({
      fullName: registration.fullName,
      email: registration.email,
      phone: registration.phone,
      country: registration.country || 'Ghana',
      church: registration.church || '',
      churchRole: registration.churchRole || 'Member',
    });
    setError('');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingId('');
    setEditForm(null);
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await requestApi(`/api/admin/registrations/${editingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token.trim(),
        },
        body: JSON.stringify(editForm),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        setError(data.message || 'Unable to update registration.');
        return;
      }

      setRegistrations((current) => current.map((item) => (
        item._id === data.registration._id ? data.registration : item
      )));
      setMessage(`${data.registration.fullName}'s registration was updated.`);
      cancelEdit();
    } catch (updateError) {
      setError('Unable to reach the server.');
      console.error(updateError);
    } finally {
      setLoading(false);
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
      if (editingId === registration._id) cancelEdit();
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
          Local development is using <strong>registrations.local.json</strong>. These records will not appear in MongoDB Compass or the production admin dashboard.
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
            <div className="search-row">
              <select value={searchField} onChange={(event) => setSearchField(event.target.value)} aria-label="Choose search field">
                <option value="all">Name, email or church</option>
                <option value="name">Name only</option>
                <option value="email">Email only</option>
                <option value="church">Church only</option>
              </select>
              <input
                id="registrationSearch"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Type a name, email or church"
              />
            </div>
          </div>

          <div className="admin-filter-grid">
            <div>
              <label htmlFor="statusFilter">Payment status</label>
              <select id="statusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="awaiting-momo-payment">Awaiting Momo payment</option>
                <option value="momo-review-pending">Momo awaiting review</option>
                <option value="momo-paid">Momo paid</option>
                <option value="cash-pending">Cash pending</option>
                <option value="cash-paid">Cash paid</option>
              </select>
            </div>
            <div>
              <label htmlFor="paymentFilter">Payment method</label>
              <select id="paymentFilter" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
                <option value="all">All methods</option>
                <option value="momo">Momo</option>
                <option value="cash">Cash</option>
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

          <div className="toolbar-footer">
            <div className="view-toggle" role="group" aria-label="Choose registration view">
              <button className={viewType === 'grid' ? 'active' : ''} type="button" onClick={() => changeView('grid')}>Grid view</button>
              <button className={viewType === 'list' ? 'active' : ''} type="button" onClick={() => changeView('list')}>List view</button>
            </div>
            <button className="secondary-button clear-filters-button" type="button" onClick={clearFilters}>Clear search and filters</button>
          </div>
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
          const isEditing = editingId === item._id;
          const isPaid = item.status.includes('paid');
          const canConfirm = capabilities.confirmPayment
            && (item.status === 'momo-review-pending' || item.status === 'cash-pending');

          return (
            <article className={`registration-card ${isPaid ? 'registration-card-paid' : 'registration-card-pending'} ${isEditing ? 'registration-card-editing' : ''}`} key={item._id}>
              <header className="registration-card-header">
                <div>
                  <p className="registration-number">Registration {pageStart + index + 1}</p>
                  <h3>{item.fullName}</h3>
                  <p className="submitted-date">Submitted {formatSubmittedDate(item.createdAt)}</p>
                </div>
                <span className={`status-pill ${isPaid ? 'status-paid' : 'status-awaiting'}`}>
                  {formatStatus(item.status)}
                </span>
              </header>

              {isEditing ? (
                <div className="registration-edit-form">
                  <div className="edit-heading">
                    <h4>Edit registration details</h4>
                    <p>Change the information below, then press Save changes.</p>
                  </div>
                  <div className="form-grid two-col">
                    <div>
                      <label htmlFor={`fullName-${item._id}`}>Full name</label>
                      <input id={`fullName-${item._id}`} value={editForm.fullName} onChange={(event) => updateEditField('fullName', event.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`email-${item._id}`}>Email address</label>
                      <input id={`email-${item._id}`} type="email" value={editForm.email} onChange={(event) => updateEditField('email', event.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`phone-${item._id}`}>Phone number</label>
                      <input id={`phone-${item._id}`} value={editForm.phone} onChange={(event) => updateEditField('phone', event.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`country-${item._id}`}>Country</label>
                      <input id={`country-${item._id}`} value={editForm.country} onChange={(event) => updateEditField('country', event.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`church-${item._id}`}>Church</label>
                      <input id={`church-${item._id}`} value={editForm.church} onChange={(event) => updateEditField('church', event.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`churchRole-${item._id}`}>Church role</label>
                      <select id={`churchRole-${item._id}`} value={editForm.churchRole} onChange={(event) => updateEditField('churchRole', event.target.value)}>
                        <option value="Pastor">Pastor</option>
                        <option value="Church worker">Church worker</option>
                        <option value="Leader">Leader</option>
                        <option value="Member">Member</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="registration-card-actions">
                    <button className="action-button" type="button" onClick={saveEdit} disabled={loading}>
                      {loading ? 'Saving changes...' : 'Save changes'}
                    </button>
                    <button className="secondary-button" type="button" onClick={cancelEdit} disabled={loading}>Cancel editing</button>
                  </div>
                </div>
              ) : (
                <>
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

                  <div className="registration-card-actions">
                    {canConfirm && (
                      <button
                        className="action-button confirm-payment-button"
                        type="button"
                        onClick={() => confirmPayment(item)}
                        disabled={confirmingId === item._id}
                      >
                        {confirmingId === item._id ? 'Confirming payment...' : 'Confirm payment and give slot'}
                      </button>
                    )}
                    {capabilities.updateRegistration && (
                      <button className="secondary-button" type="button" onClick={() => startEdit(item)}>Edit details</button>
                    )}
                    {capabilities.deleteRegistration && (
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => deleteRegistration(item)}
                        disabled={deletingId === item._id}
                      >
                        {deletingId === item._id ? 'Deleting registration...' : 'Delete registration'}
                      </button>
                    )}
                  </div>
                </>
              )}
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
