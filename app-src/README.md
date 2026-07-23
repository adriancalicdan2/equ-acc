# AIMF Equipment Accountability

Internal AIMF Tech. Corp. operations portal for vessel equipment accountability, inventory, petty cash, time cards, installation reports, payslips, and employee administration.

## Stack

- Next.js 16 App Router and React 19
- Firebase Authentication and Cloud Firestore
- Zod request and form validation
- ExcelJS for spreadsheet reports
- Docxtemplater, PizZip, Sharp, and JSZip for equipment-accountability packages

## Local development

Requirements: Node.js 20 or newer, npm, and a Firebase project with Authentication and Firestore enabled.

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Server credentials

Authenticated API routes use the Firebase Admin SDK. Configure one of the following:

- `FIREBASE_SERVICE_ACCOUNT`: the complete service-account JSON encoded as one environment-variable value; recommended for deployment.
- `app-src/service-account.json`: a local-only development fallback. This path is ignored by Git.

Never expose a service-account private key through a `NEXT_PUBLIC_` variable.

## Quality checks

```bash
npm run lint
npm run test
npm run build
```

`npm run test` currently covers the statutory contribution, withholding-tax, net-pay, and number-to-words calculations.

## Authorization

Every report-generation endpoint requires a Firebase ID token. The server re-reads the caller's Firestore profile and checks the relevant `allowedViews` permission; administrative account operations additionally require `role: "admin"`.

The repository's Firestore rules are located at `../firestore.rules`. Deploy them from the repository root with the Firebase CLI after selecting the correct Firebase project:

```bash
firebase deploy --only firestore:rules
```

Client-side page guards improve navigation but are not a substitute for deploying the Firestore rules.

## Deployment

Netlify configuration lives at `../netlify.toml`. The build base is `app-src`, and report templates are packaged under `public/templates` for server-side generation.
