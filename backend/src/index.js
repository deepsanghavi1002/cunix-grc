import 'dotenv/config';
import express from 'express';
import { service } from './service.js';
import { startMonitor } from './isms.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'8mb'}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&req.headers.origin!==process.env.APP_ORIGIN) return res.status(403).json({error:'Origin not allowed'});next();});
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'cunix-grc' }));
app.use('/api/service', service);
// Legacy demo endpoints are deliberately disabled: they had no access controls.
app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found'}));
app.use(express.static('public'));
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile('index.html', { root: 'public' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status||500).json({ error: error.status?error.message:'Unexpected server error' });
});

app.listen(process.env.PORT || 3001, () => console.log('Cunix GRC API is listening'));
startMonitor();
