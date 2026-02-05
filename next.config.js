/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SHEET_ID: process.env.SHEET_ID
  }
};

module.exports = nextConfig;
