const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');
const auth = require('./auth');

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
// Publier un trajet (il faut être connecté)
app.post('/trips', auth, async (req, res) => {
  const { from_city, to_city, departure_time, price, seats } = req.body;
  if (!from_city || !to_city || !departure_time || !price || !seats) {
    return res.status(400).json({ error: 'champs obligatoires : from_city, to_city, departure_time, price, seats' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO trips (driver_id, driver_name, from_city, to_city, departure_time, price, seats_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, req.user.name, from_city, to_city, departure_time, price, seats]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chercher des trajets : /trips?from=Fès&to=Casablanca
app.get('/trips', async (req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;
  try {
    const result = await pool.query(
      `SELECT * FROM trips
       WHERE seats_available > 0
         AND ($1::text IS NULL OR from_city ILIKE $1)
         AND ($2::text IS NULL OR to_city ILIKE $2)
       ORDER BY departure_time`,
      [from, to]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/trips/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'trajet introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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