# Render Deployment Guide

## Backend Deployment

1. **Connect GitHub Repository**
   - Go to https://render.com/dashboard
   - Click "New +"  → "Web Service"
   - Connect your GitHub account and select `open-sch-yachal` repo
   - Select "Node"

2. **Configure Backend Service**
   - **Name:** `open-sch-yachal-backend`
   - **Build Command:** `npm install && npm run build 2>/dev/null || true`
   - **Start Command:** `node server.js`
   - **Region:** Choose closest to your users

3. **Add Environment Variables** in Render Dashboard:
   ```
   NODE_ENV=production
   PORT=10000
   MONGODB_URI=mongodb+srv://byourself77by_db_user:Yachal-openSch@cluster0.fbhs1vy.mongodb.net/open-school-yachal?retryWrites=true&w=majority
   CLIENT_URL=https://open-sch-yachal.onrender.com
   ADMIN_TOKEN=Open-ScHool-Yachal-Admin-Token-For-0H-OH-i-MeanT-WITH-deadLINE-ON19-juLlie-26-Yachal-openSch
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Render will auto-deploy on every push to main

## Frontend Deployment

1. **Create Static Site**
   - In Render Dashboard: "New +" → "Static Site"
   - Connect same GitHub repo
   - **Build Command:** `cd client && npm install && npm run build`
   - **Publish Directory:** `client/dist`

2. **Update API Base URL**
   - After backend deploys, copy its URL (e.g., `https://open-sch-yachal-backend.onrender.com`)
   - Update `client/.env.production` with:
     ```
     VITE_API_BASE=https://open-sch-yachal-backend.onrender.com
     ```

3. **Deploy Frontend**
   - Click "Create Static Site"

## Testing Locally Before Deploy

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd client
npm run dev
```

Visit `http://localhost:5173` and test registration form.
