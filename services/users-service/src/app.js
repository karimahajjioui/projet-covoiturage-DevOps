const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());
client.collectDefaultMetrics();
const httpCounter = new client.Counter({
name: 'http_requests_total',
help: 'Nombre de requêtes HTTP',
labelNames: ['method', 'status']
});
app.use((req, res, next) => {
res.on('finish', () => httpCounter.inc({ method: req.method, status: 
res.statusCode }));
next();
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (req, res) => {
res.set('Content-Type', client.register.contentType);
res.end(await client.register.metrics());
});
async function initDb() {}
module.exports = { app, initDb };