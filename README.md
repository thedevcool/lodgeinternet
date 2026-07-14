# Lodge Internet

A full-stack hostel internet and TV subscription management platform built with Next.js 14. Residents can purchase data plans and activate TV subscriptions, while administrators manage hostels, billing splits, transactions, and subscriber accounts through a dedicated admin panel.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **Payments:** Paystack
- **Email:** Nodemailer (SMTP)
- **Deployment:** Vercel

---

## Features

### Resident-facing

- Browse and purchase data plans by hostel
- Paystack-powered payment checkout
- TV subscription activation and renewal
- Account login / forgot password

### Admin panel (`/admin`)

- **Dashboard** — live subscriber counts and revenue overview
- **Hostels** — create and manage hostels; assign plan types (daily, weekly, monthly, etc.)
- **Data Codes** — generate, delete, and track one-time data voucher codes
- **Purchase Logs** — searchable history of all data plan purchases; filterable by hostel, plan, and date
- **Transactions** — full transaction ledger with payment-split calculator; configurable maintenance percentage; admin and partner email fields for monthly reports
- **TV Users** — view, filter, and manage TV subscribers by hostel and status (Pending / Active / Expired); manual plan-update tool
- **Protected routes** — session-based admin authentication

---

## Project Structure

```
app/
  api/           # Next.js API routes (data plans, TV, admin, hostels)
  admin/         # Admin pages (dashboard, hostels, tv-users, transactions, …)
  dashboard/     # Resident dashboard
  login/         # Resident auth
components/      # Shared UI (Logo, Toast, ConfirmationModal, ProtectedRoute)
lib/
  firebase.ts    # Firebase initialisation (reads from env)
  email/         # Email service and templates
store/           # Zustand auth store
types/           # Shared TypeScript interfaces
```

---

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd lodge-internet
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Paystack
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=

# Admin
ADMIN_PASSWORD_HASH=          # bcrypt hash of the admin password
ADMIN_SESSION_SECRET=         # random secret for session signing

# Email (SMTP)
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
```

`.env.local` is **never committed** — it is listed in `.gitignore`.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for production

```bash
npm run build
npm start
```

---

## Firebase Setup

This project uses Firestore as its primary database. Firebase configuration files (`firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`) are excluded from version control via `.gitignore`. To set up your own Firebase project:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore** and **Authentication** (Email/Password)
3. Copy your project credentials into `.env.local`
4. Deploy Firestore security rules and indexes using the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore
```

---

## Deployment

The project is configured for **Vercel** deployment (`vercel.json` is included). Set all environment variables in your Vercel project settings before deploying.

```bash
vercel --prod
```

---

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start development server |
| `npm run build` | Create production build  |
| `npm start`     | Start production server  |
| `npm run lint`  | Run ESLint               |
