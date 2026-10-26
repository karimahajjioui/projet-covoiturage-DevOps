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
const TRIPS_URL = process.env.TRIPS_SERVICE_URL || 'http://localhost:3002';

// Appelle le service Trajets pour changer le nombre de places
async function changeSeats(tripId, change) {
  return fetch(`${TRIPS_URL}/trips/${tripId}/seats`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change })
  });
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Réserver une place : body { trip_id: 1 }
app.post('/bookings', auth, async (req, res) => {
  const { trip_id } = req.body;
  if (!trip_id) return res.status(400).json({ error: 'trip_id obligatoire' });
  try {
    const seatRes = await changeSeats(trip_id, -1);
    if (!seatRes.ok) return res.status(409).json({ error: 'plus de place ou trajet introuvable' });
    try {
      const result = await pool.query(
        'INSERT INTO bookings (trip_id, user_id) VALUES ($1, $2) RETURNING *',
        [trip_id, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await changeSeats(trip_id, 1); // on rend la place si l'enregistrement a échoué
      res.status(500).json({ error: err.message });
    }
  } catch (err) {
    res.status(502).json({ error: 'service trajets indisponible' });
  }
});

// Mes réservations
app.get('/bookings/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Annuler une réservation
app.delete('/bookings/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'réservation introuvable' });
    await changeSeats(result.rows[0].trip_id, 1);
    res.json({ message: 'réservation annulée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
}

module.exports = { app, initDb };