import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const CACHE_PATH = path.join(process.cwd(), 'data', 'sheet-cache.json');

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return res.status(404).json({
        error: 'No cached data found. Run `npm run fetch-data` to generate the cache.'
      });
    }

    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const payload = JSON.parse(raw);

    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to read cached data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
