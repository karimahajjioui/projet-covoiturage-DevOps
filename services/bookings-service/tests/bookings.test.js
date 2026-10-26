const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../src/app'); 

const token = jwt.sign({ id: 1, name: 'Test' }, 'dev-secret');

test('GET /bookings/me sans jeton renvoie 401', async () => {
  const res = await request(app).get('/bookings/me');
  expect(res.statusCode).toBe(401);
});

test('POST /bookings sans jeton renvoie 401', async () => {
  const res = await request(app).post('/bookings').send({ trip_id: 1 });
  expect(res.statusCode).toBe(401);
});

test('POST /bookings sans trip_id renvoie 400', async () => {
  const res = await request(app)
    .post('/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({}); 
  expect(res.statusCode).toBe(400);
});