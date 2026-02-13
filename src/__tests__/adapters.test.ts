jest.mock('@/lib/sheet', () => ({
  ...jest.requireActual('@/lib/sheet'),
  fetchAllSheetData: jest.fn().mockResolvedValue({
    columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
    rows: [['2024-05-01T12:00:00', 'A1', 'T1', '0', 'pass']],
    types: ['date', 'string', 'string', 'string', 'string']
  })
}));

import { getDataSourceType, fetchData } from '@/lib/adapters';

const expectedColumns = ['Date', 'SN', 'Tester', 'Other', 'Last_time'];

describe('adapters', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getDataSourceType', () => {
    it('returns "sheet" by default', () => {
      delete process.env.DATA_SOURCE;
      expect(getDataSourceType()).toBe('sheet');
    });

    it('returns "json" when DATA_SOURCE=json', () => {
      process.env.DATA_SOURCE = 'json';
      expect(getDataSourceType()).toBe('json');
    });

    it('returns "sheet" for unknown values', () => {
      process.env.DATA_SOURCE = 'unknown';
      expect(getDataSourceType()).toBe('sheet');
    });
  });

  describe('fetchData', () => {
    it('fetches from sheet adapter by default', async () => {
      delete process.env.DATA_SOURCE;
      const result = await fetchData();
      expect(result.columns).toEqual(expectedColumns);
      expect(result.rows).toHaveLength(1);
    });

    it('fetches from json adapter when DATA_SOURCE=json', async () => {
      process.env.DATA_SOURCE = 'json';
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            columns: expectedColumns,
            rows: [['2024-05-01T12:00:00', 'A1', 'T1', '0', 'pass']],
            types: ['date', 'string', 'string', 'string', 'string']
          }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await fetchData();
      expect(global.fetch).toHaveBeenCalledWith('/api/sheet-data');
      expect(result.columns).toEqual(expectedColumns);
    });

    it('throws on json adapter HTTP error', async () => {
      process.env.DATA_SOURCE = 'json';
      const mockResponse = {
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Not found')
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await expect(fetchData()).rejects.toThrow(/Failed to load cached data/);
    });
  });
});
