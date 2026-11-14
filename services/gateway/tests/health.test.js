const request = require('supertest');
const { app } = require('../src/app');

test('GET /health renvoie ok', async () => {
  const res = await request(app).get('/health');
  expect(res.statusCode).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('PATCH /api/trips/1/seats est refusé (route interne)', async () => {
  const res = await request(app).patch('/api/trips/1/seats').send({ change: -1 });
  expect(res.statusCode).toBe(403);
});