/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SHEET_ID: process.env.SHEET_ID,
    DATA_SOURCE: process.env.DATA_SOURCE
  },
  outputFileTracingIncludes: {
    '/api/sheet-data': ['./data/**']
  }
};

module.exports = nextConfig;
