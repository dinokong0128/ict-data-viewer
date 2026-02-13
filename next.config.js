/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SHEET_ID: process.env.SHEET_ID,
    DATA_SOURCE: process.env.DATA_SOURCE
  }
};

module.exports = nextConfig;
