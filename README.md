# Open School of Ministry - Ghana Registration (MERN)

This workspace contains a MERN stack registration app for the Ghana approved center at Yachal House, Ridge Accra.

## What is included

- `backend/` - Express API plus MongoDB registration tracking
- `client/` - React + Vite registration form and admin dashboard
- Unique `OpenSch-Yachalxxx` momo reference generation per email
- Momo transaction submission followed by admin payment review
- Admin payment confirmation, applicant slot email, CSV export, and status tracking

## Setup

1. Install dependencies for the backend:

```powershell
cd backend
npm install
```

2. Copy the backend environment file:

```powershell
copy .env.example .env
```

3. Set `ADMIN_TOKEN` in `backend/.env` and confirm `MONGODB_URI`.

4. Start the backend:

```powershell
npm run dev
```

5. Install dependencies for the frontend:

```powershell
cd ..\client
npm install
```

6. Copy the frontend environment file if needed:

```powershell
copy .env.example .env
```

7. Start the frontend:

```powershell
npm run dev
```

8. Open the app in your browser at `http://localhost:5173`.

## Notes

- Registration on the frontend is explicitly Ghana-only.
- Registration deadline is `Sunday, June 28, 2026`.
- Users outside Ghana should use `https://osom.saintscommunity.net/`.
- Momo payments are fixed at `GHS 250`, use the Yachal House Momo Number `0544600600`, and generate a unique reference code.
- Admin can load registrations and download a CSV from the admin panel.
- On Render, set `ADMIN_TOKEN` for dashboard access and `MONGODB_URI` to a working MongoDB connection string. If MongoDB is unavailable, the backend can fall back to local file storage so users can still submit, but MongoDB should be restored for permanent storage.
