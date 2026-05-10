import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

// Initialize dotenv if needed
import 'dotenv/config';

import router from './src/backend/routes.ts';
import { runAllSyncs } from './src/backend/jobs/syncDFe.ts';
import { checkCertificatesJob } from './src/backend/jobs/checkCerts.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware to parse JSON
  app.use(express.json());
  
  // Basic healthcheck
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
  });

  // API Routes
  app.use('/api', router);

  // Setup Background Jobs
  // Run every hour
  cron.schedule('0 * * * *', () => {
    console.log('Running DFe Sync Job');
    runAllSyncs().catch(console.error);
  });

  // Run daily at noon
  cron.schedule('0 12 * * *', () => {
     checkCertificatesJob().catch(console.error);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production setup
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
