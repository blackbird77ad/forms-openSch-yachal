import { useEffect, useState } from 'react';
import RegistrationForm from './components/RegistrationForm';
import AdminDashboard from './components/AdminDashboard';
import AccommodationOptions from './components/AccommodationOptions';

function getViewFromLocation() {
  const adminHashes = new Set(['#/admin', '#admin']);
  const accommodationHashes = new Set(['#/accommodation', '#accommodation']);

  if (adminHashes.has(window.location.hash) || window.location.pathname.endsWith('/admin')) return 'admin';
  if (accommodationHashes.has(window.location.hash) || window.location.pathname.endsWith('/accommodation')) {
    return 'accommodation';
  }

  return 'register';
}

function getPortalBasePath() {
  return window.location.pathname.replace(/\/(admin|accommodation)\/?$/, '/') || '/';
}

export default function App() {
  const [view, setView] = useState(getViewFromLocation);

  useEffect(() => {
    const handleLocationChange = () => setView(getViewFromLocation());

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    handleLocationChange();

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const showAdmin = view === 'admin';
  const showAccommodation = view === 'accommodation';

  function showRegistrationForm() {
    window.history.pushState(null, '', `${getPortalBasePath()}${window.location.search}`);
    setView('register');
  }

  function showAccommodationOptions() {
    window.history.pushState(null, '', `${getPortalBasePath()}${window.location.search}#/accommodation`);
    setView('accommodation');
  }

  return (
    <div className="app-shell">
      <section className="hero-banner">
        <img className="hero-img" src="/About-open-school-ministry.jpg" alt="Open School of Ministry" />
        <div className="hero-overlay">
          <div className="hero-content">
            <p className="eyebrow">Ghana Registration Portal</p>
            <h1>Open School of Ministry 2026</h1>
            <p>Register to join through the Ghana approved center at Yachal House, Ridge Accra.</p>
          </div>
        </div>
      </section>

      <header className="topbar">
        <div>
          <p className="eyebrow">Ghana Registration Portal</p>
        </div>
        <div className="nav-buttons">
          {!showAdmin && (
            <>
              <button className={!showAccommodation ? 'active' : ''} type="button" onClick={showRegistrationForm}>
                Registration
              </button>
              <button className={showAccommodation ? 'active' : ''} type="button" onClick={showAccommodationOptions}>
                Accommodation
              </button>
            </>
          )}
          {showAdmin && (
            <button type="button" onClick={showRegistrationForm}>
              Registration form
            </button>
          )}
        </div>
      </header>

      <main>
        {showAdmin ? (
          <AdminDashboard />
        ) : showAccommodation ? (
          <AccommodationOptions />
        ) : (
          <>
            <details className="panel about-section">
              <summary>
                <span>About Open School of Ministry</span>
                <span className="accordion-hint">Click to read</span>
              </summary>
              <div className="accordion-content">
                <p>Our local church, Saints Community Church, runs an internal leadership training school called Livingword Ministerial Academy (L.M.A), which is open ONLY to leaders of our local church. However, at different times in the past, we have organized "Open Classes" for church members who are not otherwise qualified for the school and for non-church members.</p>
                <p>It is called "Open School of Ministry". It was first held in July 2015, followed by three subsequent editions, with the latest held in July 2024.</p>
                <p>The fifth edition will be held from <strong>Monday, July 6 - Wednesday, July 8, 2026</strong>, with arrival on <strong>Sunday, July 5, 2026</strong>.</p>
                <p>Registration deadline: <strong>Sunday, June 28, 2026</strong>.</p>
              </div>
            </details>

            <RegistrationForm onViewAccommodation={showAccommodationOptions} />
          </>
        )}
      </main>
    </div>
  );
}
