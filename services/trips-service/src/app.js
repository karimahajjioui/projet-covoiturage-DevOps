const express = require('express');
const { Pool } = require('pg');
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
  res.on('finish', () => httpCounter.inc({ method: req.method, status: res.statusCode }));
  next();
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Changer le nombre de places : body { change: -1 } pour réserver, { change: 1 } pour annuler
app.patch('/trips/:id/seats', async (req, res) => {
  const change = Number(req.body.change);
  if (![-1, 1].includes(change)) return res.status(400).json({ error: 'change doit valoir -1 ou 1' });
  try {

    const result = await pool.query(
      `UPDATE trips SET seats_available = seats_available + $1
       WHERE id = $2 AND seats_available + $1 >= 0
       RETURNING *`,
      [change, req.params.id]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: 'plus de place ou trajet introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL,
    driver_name TEXT NOT NULL,
    from_city TEXT NOT NULL,
    to_city TEXT NOT NULL,
    departure_time TIMESTAMP NOT NULL,
    price NUMERIC NOT NULL,
    seats_available INTEGER NOT NULL
  )`);
}

module.exports = { app, initDb };