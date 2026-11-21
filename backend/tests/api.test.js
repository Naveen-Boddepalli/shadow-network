process.env.JWT_SECRET = 'test-jwt-secret';
process.env.API_SECRET = 'test-api-secret';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

jest.mock('../services/ipfsService', () => ({
  uploadToIPFS: jest.fn(),
  downloadFromIPFS: jest.fn(),
  getIPFSNodeInfo: jest.fn().mockRejectedValue(new Error('offline')),
}));
jest.mock('../services/aiService', () => ({
  checkAIEngineHealth: jest.fn().mockResolvedValue({ ok: false }),
}));

const request = require('supertest');
const app = require('../server');

describe('API', () => {
  it('GET / returns API status', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('running');
  });

  it('GET /api/v1/health returns 503 when MongoDB and IPFS are down', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.statusCode).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.health).toMatchObject({
      server: 'ok', mongodb: 'disconnected', ipfs: 'disconnected', aiEngine: 'unreachable',
    });
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('rejects disallowed CORS origins with 403', async () => {
    const res = await request(app).get('/').set('Origin', 'https://evil.example');
    expect(res.statusCode).toBe(403);
  });

  it('allows configured CORS origins', async () => {
    const res = await request(app).get('/').set('Origin', 'http://localhost:3000');
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('GET /notes/:id rejects malformed IDs', async () => {
    const res = await request(app).get('/api/v1/notes/not-an-id');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid note ID');
  });

  it('GET /search requires q', async () => {
    const res = await request(app).get('/api/v1/search');
    expect(res.statusCode).toBe(400);
  });

  it('GET /download/:cid rejects malformed CIDs', async () => {
    const res = await request(app).get('/api/v1/download/..%2F..%2Fetc');
    expect(res.statusCode).toBe(400);
  });

  describe('auth', () => {
    it('rejects a wrong secret', async () => {
      const res = await request(app).post('/api/v1/auth/token').send({ secret: 'wrong' });
      expect(res.statusCode).toBe(401);
    });

    it('protected routes require a token', async () => {
      const res = await request(app).delete('/api/v1/notes/507f1f77bcf86cd799439011');
      expect(res.statusCode).toBe(401);
    });

    it('issues a token that protected routes accept', async () => {
      const login = await request(app).post('/api/v1/auth/token').send({ secret: 'test-api-secret' });
      expect(login.statusCode).toBe(200);
      expect(login.body.token).toEqual(expect.any(String));

      // Passes auth, then fails ID validation (no DB needed)
      const res = await request(app)
        .delete('/api/v1/notes/not-an-id')
        .set('Authorization', `Bearer ${login.body.token}`);
      expect(res.statusCode).toBe(400);
    });
  });
});
