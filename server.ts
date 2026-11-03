import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initDatabase, backupDatabase, uploadsDir } from './server/db.ts';
import { initNeonDatabase } from './server/neon.ts';
import { apiRouter } from './server/routes.ts';
import { rehydrateFromFirestore, pushAllToFirestore } from './server/firestoreService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // 1. Initialize SQLite WAL schema
  initDatabase();

  // 2. Initialize Neon PostgreSQL (if DATABASE_URL is configured)
  initNeonDatabase().catch((e) => console.warn('[Neon Postgres] Startup check notice:', e.message));

  // 3. Immediately rehydrate all permanent data from Cloud Firestore (orders, customers, payments)
  console.log('[Startup] Restoring all permanent data from Cloud Firestore...');
  rehydrateFromFirestore()
    .then((result) => {
      console.log(`[Startup] Cloud Firestore rehydration successful:`, result);
    })
    .catch((err) => {
      console.warn(`[Startup] Initial Firestore rehydration notice:`, err.message);
    });

  const app = express();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // High payload limits for photo uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Enable CORS for all origins and headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Serve persistent photos
  app.use('/uploads', express.static(uploadsDir));

  // Mount backend API routes
  app.use('/api', apiRouter);

  // Guarantee /api routes NEVER fall through to Vite HTML under any circumstance
  app.all(/^\/api(\/.*)?$/, (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}` });
  });

  // Global error handler for API exceptions: ALWAYS return JSON, NEVER HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Server Error]:', err);
    if (res.headersSent) return next(err);
    if (req.originalUrl?.startsWith('/api') || req.url?.startsWith('/api')) {
      return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
    next(err);
  });

  // Prevent unhandled errors or transient cloud sync issues from crashing the server
  process.on('uncaughtException', (err: any) => {
    const msg = err?.message || String(err);
    if (msg.includes('firestore') || err?.code === 14 || msg.includes('dns:')) {
      console.warn('[Cloud Sync Notice]:', msg);
    } else {
      console.error('[Uncaught Exception]:', err);
    }
  });

  process.on('unhandledRejection', (reason: any) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('firestore') || msg.includes('UNAVAILABLE')) {
      console.warn('[Cloud Sync Notice]:', msg);
    } else {
      console.warn('[Unhandled Rejection]:', reason);
    }
  });

  // Mount Frontend (Vite in dev, dist in production)
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { 
        middlewareMode: true,
        ws: {
          server: server
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Graceful shutdown handling to flush database WAL checkpoint
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Flushing database checkpoint...');
    backupDatabase();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received. Flushing database checkpoint...');
    backupDatabase();
    process.exit(0);
  });

  // Dynamic port binding with automatic fallback if port is in use
  function listenOnPort(portToTry: number) {
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${portToTry} is already in use. Trying port ${portToTry + 1}...`);
        if (portToTry < PORT + 10) {
          listenOnPort(portToTry + 1);
        } else {
          console.error(`\n❌ Could not find a free port between ${PORT} and ${portToTry}.`);
          console.error(`To free port ${PORT}, run in PowerShell: Stop-Process -Name node -Force\n`);
          process.exit(1);
        }
      } else {
        console.error('[Server Error]:', err);
        process.exit(1);
      }
    });

    server.listen(portToTry, '0.0.0.0', () => {
      console.log(`\n======================================================`);
      console.log(`🧺 Laundry Flow Manager is running!`);
      console.log(`👉 Local:   http://localhost:${portToTry}`);
      console.log(`👉 Network: http://127.0.0.1:${portToTry}`);
      console.log(`======================================================\n`);
    });
  }

  listenOnPort(PORT);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
