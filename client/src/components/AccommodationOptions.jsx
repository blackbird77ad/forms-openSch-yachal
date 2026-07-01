const HOST_LOCATION = {
  name: 'Yachal House, Ridge Accra',
  contact: '(+233) 20-274-2055',
  mapUrl: 'https://maps.app.goo.gl/EqFWF6JHp26LvAsd9?g_st=aw',
};

const ACCOMMODATIONS = [
  {
    name: 'Alisa Hotel',
    location: 'North Ridge',
    distance: '2-3 minutes drive to host location without traffic',
    address: '21 Dr. Issert Rd, North Ridge, Accra',
    contact: '030 221 4233',
    price: '$81 estimated',
    bookingUrl: 'https://www.booking.com',
  },
  {
    name: 'Highgate Hotel',
    location: 'Asylum Down',
    distance: '2 minutes drive to host location without traffic',
    address: '70 Mango Tree Avenue, Asylum Down, Accra',
    contact: '030 223 3315',
    price: 'From $39 - $96 estimated',
  },
  {
    name: 'Aklin Hotel and Resorts',
    location: 'Asylum Down',
    distance: '5-7 minutes drive to host location without traffic',
    address: '4 Nyanyo Lane, GA-222-2148, Asylum Down, Accra',
    contact: '030 226 4360',
    price: 'From $51 - $64 per night estimated',
    bookingUrl: 'https://www.booking.com',
  },
  {
    name: 'Solea - 1 Bedroom Apartment',
    location: 'North Ridge',
    distance: '5-7 minutes drive to host location',
    address: 'Ringway Link Solaris Building, Accra',
    price: '$105 - $120+ per night estimated',
    bookingUrl: 'https://www.booking.com',
  },
  {
    name: 'Efex Hotel',
    location: '10 Akuyea Addy Lane, Accra',
    distance: '12 minutes drive to host location',
    address: 'GA-103-4623, off Glover Road, Accra',
    contact: '054 446 2862',
    price: 'Standard GHS 300, Deluxe GHS 350, Executive GHS 400',
  },
  {
    name: 'ATU Guest House',
    location: 'Liberia Road, Accra, near the main ATU campus',
    distance: '5-7 minutes drive to host location',
    address: 'HQ4V+5P6, Liberia Road, Accra, near the main ATU campus',
    contact: '055 871 7579 / 023 426 6160',
    price: 'Standard GHS 250, Executive GHS 300, Suite GHS 450',
  },
];

function phoneHref(contact) {
  if (!contact) return '';
  const firstNumber = contact.split('/')[0].replace(/[^\d+]/g, '');
  return firstNumber ? `tel:${firstNumber}` : '';
}

export default function AccommodationOptions({ compact = false }) {
  return (
    <section className={`panel accommodation-panel ${compact ? 'accommodation-panel-compact' : ''}`}>
      <div className="accommodation-header">
        <div>
          <p className="eyebrow">Participant accommodation</p>
          <h2>Book accommodation near the Open School host location</h2>
          <p>
            These options are close to {HOST_LOCATION.name}. Prices are estimates from the accommodation list and may change
            when participants book directly with the hotel or booking site.
          </p>
        </div>
        <a className="secondary-link-button" href={HOST_LOCATION.mapUrl} target="_blank" rel="noopener noreferrer">
          View host map
        </a>
      </div>

      <div className="host-location-card">
        <div>
          <span>Host location</span>
          <strong>{HOST_LOCATION.name}</strong>
        </div>
        <div>
          <span>Contact</span>
          <strong>{HOST_LOCATION.contact}</strong>
        </div>
      </div>

      <div className="accommodation-grid">
        {ACCOMMODATIONS.map((option) => {
          const contactHref = phoneHref(option.contact);

          return (
            <article className="accommodation-card" key={option.name}>
              <div>
                <p className="accommodation-location">{option.location}</p>
                <h3>{option.name}</h3>
              </div>

              <div className="accommodation-summary">
                <span>{option.distance}</span>
                <strong>{option.price}</strong>
              </div>

              <details className="accommodation-extra">
                <summary>More details</summary>
                <dl className="accommodation-details">
                  <div>
                    <dt>Address</dt>
                    <dd>{option.address}</dd>
                  </div>
                  {option.contact && (
                    <div>
                      <dt>Contact</dt>
                      <dd>{option.contact}</dd>
                    </div>
                  )}
                </dl>
              </details>

              <div className="accommodation-actions">
                {option.bookingUrl && (
                  <a className="action-link-button" href={option.bookingUrl} target="_blank" rel="noopener noreferrer">
                    Book online
                  </a>
                )}
                {contactHref && (
                  <a className="secondary-link-button" href={contactHref}>
                    Call
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
