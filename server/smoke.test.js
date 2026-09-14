import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './index.js';

test('health endpoint is available', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test('projects reject invalid payloads', async () => {
  const response = await request(app).post('/api/projects').send({ name: '' });
  assert.equal(response.status, 400);
});
