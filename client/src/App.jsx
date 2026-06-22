import { useEffect, useState } from 'react';
import RegistrationForm from './components/RegistrationForm';
import AdminDashboard from './components/AdminDashboard';

function getViewFromLocation() {
  const adminHashes = new Set(['#/admin', '#admin']);
  return adminHashes.has(window.location.hash) || window.location.pathname.endsWith('/admin') ? 'admin' : 'register';
}

export default function App() {
  const [view, setView] = useState(getViewFromLocation);

  useEffect(() => {
    const handleLocationChange = () => setView(getViewFromLocation());

    window.addEventListener('hashchange', handleLocationChange);
    handleLocationChange();

    return () => window.removeEventListener('hashchange', handleLocationChange);
  }, []);

  const showAdmin = view === 'admin';

  function showRegistrationForm() {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
    setView('register');
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
        {showAdmin && (
          <div className="nav-buttons">
            <button type="button" onClick={showRegistrationForm}>
              Registration form
            </button>
          </div>
        )}
      </header>

      <main>
        {!showAdmin ? (
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

            <RegistrationForm />
          </>
        ) : (
          <AdminDashboard />
        )}
      </main>
    </div>
  );
}
