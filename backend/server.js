const express = require('express');
const cors = require('cors');
const dns = require('dns');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const registrationRoutes = require('./routes/registrations');
const adminRoutes = require('./routes/admin');
const {
  enableFileFallback,
  getStoreMode,
  syncLocalRegistrationsToMongo,
} = require('./services/registrationStore');

dotenv.config();

const mongoDnsServers = (process.env.MONGODB_DNS_SERVERS || '')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);

if (mongoDnsServers.length > 0) {
  dns.setServers(mongoDnsServers);
  console.log(`Using configured MongoDB DNS resolvers: ${mongoDnsServers.join(', ')}`);
}

const app = express();
app.use(express.json());
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/^CLIENT_URL=/, ''))
  .filter(Boolean);
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://register.yachalhousegh.com',
  'https://open-sch-yachal.pages.dev',
  ...configuredOrigins,
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use('/api/registrations', registrationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Open School of Ministry Ghana registration API',
    storage: getStoreMode(),
  });
});

app.get('/api/health', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: 'unavailable',
      storage: getStoreMode(),
      database: null,
    });
  }

  try {
    await mongoose.connection.db.admin().ping();
    return res.json({
      status: 'ok',
      storage: 'mongo',
      database: mongoose.connection.name,
      collection: 'registrations',
    });
  } catch (error) {
    console.error('MongoDB health check failed:', error.message);
    return res.status(503).json({
      status: 'unavailable',
      storage: getStoreMode(),
      database: mongoose.connection.name || null,
    });
  }
});

const PORT = process.env.PORT || 4001;

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/open-school-yachal';
const defaultMongoTimeoutMs = process.env.NODE_ENV === 'production' ? 30000 : 5000;
const mongoTimeoutMs = Number(process.env.MONGODB_TIMEOUT_MS || defaultMongoTimeoutMs);
const canUseFileFallback = process.env.NODE_ENV !== 'production' && process.env.ENABLE_FILE_FALLBACK !== 'false';
const fallbackPath = canUseFileFallback ? enableFileFallback() : null;

if (fallbackPath) {
  console.warn(`Local file registration store ready at ${fallbackPath}`);
}

async function syncFallbackRecords() {
  const result = await syncLocalRegistrationsToMongo();
  if (result.imported > 0 || result.updated > 0) {
    console.log(`Synced local registrations to MongoDB: ${result.imported} imported, ${result.updated} updated.`);
  }
}

mongoose.connection.on('reconnected', () => {
  syncFallbackRecords().catch((error) => {
    console.error('Unable to sync fallback registrations after MongoDB reconnect:', error.message);
  });
});

async function startServer() {
  try {
    const mongoOptions = { serverSelectionTimeoutMS: mongoTimeoutMs };
    if (process.env.MONGODB_DB_NAME) {
      mongoOptions.dbName = process.env.MONGODB_DB_NAME;
    }
    await mongoose.connect(mongoUri, mongoOptions);
    console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);
    await syncFallbackRecords();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    if (fallbackPath) {
      console.warn(`Continuing with local file registration store at ${fallbackPath}`);
    } else {
      console.warn('Server running but database unavailable. Requests will fail gracefully.');
    }
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
