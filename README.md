# ICT Data Viewer

A Next.js + React dashboard that visualizes ICT test logs directly from Google Sheets. The app reads the data live from the sheet and does **not** download or persist any records locally.

## Tech stack

- Next.js + React
- TypeScript
- Jest + Testing Library
- ESLint

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` and use the GID field to switch tabs.

## Tests & linting

- Run unit tests:
  ```bash
  npm test
  ```
- Run linting:
  ```bash
  npm run lint
  ```

## Troubleshooting

If the UI reports “Not found” or “Unable to load data,” confirm the Google Sheet is shared with **Anyone with the link** and that the Sheet GID matches the tab you want to view.
