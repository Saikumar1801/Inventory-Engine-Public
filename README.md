# Inventory Engine

A high-performance product browsing backend and interface designed to handle large-scale datasets with sub-millisecond precision.

## 🚀 Key Features

- **Keyset Pagination**: Implemented modern cursor comparisons (`startAfter`) instead of standard `OFFSET` to ensure $O(\log N)$ performance across millions of Firestore records.
- **Data Consistency**: Users never see duplicate items or miss items when new products are added during a session, thanks to stable compound cursor logic.
- **Performance Monitoring**: Real-time server execution time tracking displayed on every fetch.
- **Stable Sorting**: Supports 'Newest First' and 'Price: Low to High' while maintaining keyset stability using unique Document IDs as final tie-breakers.
- **Latest Action Indicators**: Displays relative timestamps (e.g., "just now", "1 min ago", "2 hours ago") for every product based on its last modification date.
- **Optimized Seeding**: Fast batch-insert configuration that populates the database with 2,000 highly optimized records in under 10 seconds.

## 🛠 Tech Stack

- **Frontend**: React, Tailwind CSS, Motion (Animations), Lucide React.
- **Backend**: Node.js, Express, Firebase Client SDK (configured for server-side execution with Node).
- **Persistence**: Cloud Firestore (Project ID: `products-52380`).
- **Language**: TypeScript throughout.

## 📐 Architecture: Why Keyset Pagination?

Even in managed databases like Firestore, large offset queries are expensive and slow. We utilize Firestore's `startAfter` (Keyset Pagination) combined with indexed composite attributes to ensure stable $O(\log N)$ seek times.

**Our Seek Method Implementation:**
We cursor by either `(createdAt, docId)` or `(price, docId)` depending on the active sort order. Using the unique document ID (`__name__`) as a tie-breaker ensures that the pagination is perfectly stable even if multiple items have identical timestamps or prices.

## 🚦 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Database Connection
The application is pre-configured to connect to the custom Firestore project `products-52380` inside the `(default)` database instance.

### 3. Seed the Database
To quickly seed the Firestore database with 2,000 product records, run:
```bash
npx tsx seed.ts
```

### 4. Run the Development Server
```bash
npm run dev
```

## 📝 Design Note
The UI is styled with a "minimalist utility" aesthetic, utilizing crisp typography (Inter & JetBrains Mono) with rich negative space to reflect a professional inventory tool rather than a standard consumer store.

