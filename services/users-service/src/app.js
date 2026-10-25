const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email et password sont obligatoires' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email déjà utilisé' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'email ou mot de passe incorrect' });
    }
    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);
}

module.exports = { app, initDb };