import 'dotenv/config';
import express from 'express';
import { dashboardRouter } from './routes/dashboard.js';
import { findingsRouter } from './routes/findings.js';

const app = express();
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'cunix-grc' }));
app.use('/api/dashboard', dashboardRouter);
app.use('/api/findings', findingsRouter);
app.use(express.static('public'));
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile('index.html', { root: 'public' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Unexpected server error' });
});

app.listen(process.env.PORT || 3001, () => console.log('Cunix GRC API is listening'));

