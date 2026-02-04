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
2. Set the Google Sheet ID in an environment variable:
   ```bash
   export NEXT_PUBLIC_SHEET_ID="your-sheet-id"
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` and the dashboard will load all tabs in the sheet.

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

If the UI reports “Not found” or “Unable to load data,” confirm the Google Sheet is shared with **Anyone with the link** and that `NEXT_PUBLIC_SHEET_ID` is set correctly.

## Vercel config

Add `NEXT_PUBLIC_SHEET_ID` as an environment variable in your Vercel project settings.
