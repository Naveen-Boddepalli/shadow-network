const request = require('supertest');
const app = require('../server');

describe('Health and Root Endpoints', () => {
  // Mock connectDB so it doesn't actually connect during tests
  jest.mock('../config/db', () => jest.fn());

  it('GET / should return API status', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('running');
  });

  it('GET /api/v1/health should return health status (503 if disconnected)', async () => {
    const res = await request(app).get('/api/v1/health');
    // It will return 503 because we mocked the DB connection to not connect
    expect(res.statusCode).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.health).toBeDefined();
  });
});
