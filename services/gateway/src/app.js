const express = require('express');
const client = require('prom-client');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
// Pas de express.json() ici : la Gateway transmet les requêtes telles quelles.

client.collectDefaultMetrics();
const httpCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre de requêtes HTTP',
  labelNames: ['method', 'status']
});
app.use((req, res, next) => {
  res.on('finish', () => httpCounter.inc({ method: req.method, status: res.statusCode }));
  next();
});

const USERS_URL = process.env.USERS_SERVICE_URL || 'http://localhost:3001';
const TRIPS_URL = process.env.TRIPS_SERVICE_URL || 'http://localhost:3002';
const BOOKINGS_URL = process.env.BOOKINGS_SERVICE_URL || 'http://localhost:3003';
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3004';

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// La route des places est interne : seul le service Réservations l'appelle
app.patch('/api/trips/:id/seats', (req, res) => {
  res.status(403).json({ error: 'route interne' });
});

// Redirige les adresses qui commencent par prefix vers le service cible
function proxy(prefix, target, rewriteTo) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: prefix,
    pathRewrite: { ['^' + prefix]: rewriteTo }
  });
}

app.use(proxy('/api/users', USERS_URL, ''));
app.use(proxy('/api/trips', TRIPS_URL, '/trips'));
app.use(proxy('/api/bookings', BOOKINGS_URL, '/bookings'));
app.use(proxy('/api/notifications', NOTIFICATIONS_URL, '/notifications'));

async function initDb() {}

module.exports = { app, initDb };