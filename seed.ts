import dotenv from 'dotenv';
dotenv.config();

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || ""
};

if (!firebaseConfig.apiKey) {
  console.warn("⚠️ Warning: Firebase environment variables are not configured in .env for seed script.");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "(default)");

async function seed() {
  console.log('🌱 Starting Firestore client-side seed...');
  const startTime = Date.now();

  const categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Toys', 'Garden', 'Beauty', 'Sports'];
  const totalProducts = 2000; // Reducing for client-side speed/stability
  const batchSize = 100; // Client-side batches are more sensitive

  console.log(`Generating and writing ${totalProducts} products...`);

  for (let i = 0; i < totalProducts; i += batchSize) {
    const batch = writeBatch(db);
    const count = Math.min(batchSize, totalProducts - i);

    for (let j = 0; j < count; j++) {
      const idx = i + j;
      const productRef = doc(collection(db, 'products'));
      const now = new Date(Date.now() - idx * 1000);
      
      batch.set(productRef, {
        name: `Product ${idx}`,
        category: categories[Math.floor(Math.random() * categories.length)],
        price: Math.floor(Math.random() * 10000) + 500,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });
    }

    await batch.commit();
    if ((i + batchSize) % 500 === 0) {
      console.log(`Inserted ${i + batchSize} products...`);
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`✅ Seeded ${totalProducts} products successfully in ${duration}s`);
  process.exit(0);
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
