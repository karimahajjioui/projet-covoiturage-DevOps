const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
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
const QUEUE = 'notifications';

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Les 50 dernières notifications
app.get('/notifications', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notifications ORDER BY id DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RabbitMQ met quelques secondes à démarrer : on réessaie
async function connectRabbit() {
  for (let i = 0; i < 30; i++) {
    try {
      return await amqp.connect(process.env.RABBITMQ_URL);
    } catch (err) {
      console.log('RabbitMQ pas prêt, nouvelle tentative dans 3 secondes...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('RabbitMQ injoignable');
}

// Écoute la file et enregistre chaque message
async function startConsumer() {
  const conn = await connectRabbit();
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE, { durable: true });
  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      const text = event.type === 'booking.created'
        ? `Nouvelle réservation sur le trajet ${event.trip_id} par ${event.user_name}`
        : `Réservation annulée sur le trajet ${event.trip_id}`;
      await pool.query('INSERT INTO notifications (type, message) VALUES ($1, $2)', [event.type, text]);
      console.log('Notification :', text);
      channel.ack(msg);
    } catch (err) {
      console.error('Message rejeté :', err.message);
      channel.nack(msg, false, false);
    }
  });
}

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  // Le consommateur démarre en arrière-plan : /health répond tout de suite
  if (process.env.RABBITMQ_URL) {
    startConsumer().catch((err) => console.error(err.message));
  }
}

module.exports = { app, initDb };