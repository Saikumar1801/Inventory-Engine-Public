import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { performance } from 'perf_hooks';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection as firestoreCollection, 
  query as firestoreQuery, 
  where as firestoreWhere, 
  orderBy as firestoreOrderBy, 
  limit as firestoreLimit, 
  startAfter as firestoreStartAfter, 
  getDocs as firestoreGetDocs, 
  doc as firestoreDoc, 
  writeBatch as firestoreWriteBatch, 
  Timestamp as firestoreTimestamp 
} from 'firebase/firestore';

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
  console.warn("⚠️ Warning: Firebase environment variables are not loaded/configured.");
}

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, "(default)");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API Endpoints
app.get('/api/products', async (req, res) => {
  const startTime = performance.now();
  try {
    const { category, cursorValue, cursorId, sortBy = 'newest', limit: limitParam = '20', search } = req.query;
    const pageSize = parseInt(limitParam as string, 10);

    let q: any = firestoreCollection(db, 'products');

    // Filter by category
    if (category) {
      q = firestoreQuery(q, firestoreWhere('category', '==', category as string));
    }

    // Apply Sorting & Keyset Pagination
    if (search) {
      const searchStr = search as string;
      const formattedSearch = searchStr.charAt(0).toUpperCase() + searchStr.slice(1);
      q = firestoreQuery(q, 
        firestoreWhere('name', '>=', formattedSearch), 
        firestoreWhere('name', '<=', formattedSearch + '\uf8ff'),
        firestoreOrderBy('name', 'asc'),
        firestoreOrderBy('__name__', 'asc')
      );
    } else if (sortBy === 'price_asc') {
      q = firestoreQuery(q, firestoreOrderBy('price', 'asc'), firestoreOrderBy('__name__', 'asc'));
    } else {
      q = firestoreQuery(q, firestoreOrderBy('createdAt', 'desc'), firestoreOrderBy('__name__', 'desc'));
    }

    // Applying Cursor
    if (cursorValue && cursorId) {
      let lastValue: any;
      if (search) {
        lastValue = cursorValue as string;
      } else if (sortBy === 'price_asc') {
        lastValue = parseInt(cursorValue as string, 10);
      } else {
        lastValue = firestoreTimestamp.fromMillis(parseInt(cursorValue as string, 10));
      }
      
      q = firestoreQuery(q, firestoreStartAfter(lastValue, cursorId));
    }

    const snapshot = await firestoreGetDocs(firestoreQuery(q, firestoreLimit(pageSize)));
    const result = snapshot.docs.map(doc => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as firestoreTimestamp).toDate(),
        updatedAt: (data.updatedAt as firestoreTimestamp).toDate(),
      };
    });

    // Prepare next cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    let nextCursor = null;
    if (lastDoc) {
      const data = lastDoc.data() as any;
      nextCursor = {
        value: search ? data.name : (sortBy === 'price_asc' ? data.price : (data.createdAt as firestoreTimestamp).toMillis()),
        id: lastDoc.id
      };
    }

    const endTime = performance.now();
    const executionTimeMs = parseFloat((endTime - startTime).toFixed(2));

    res.json({
      data: result,
      nextCursor,
      executionTimeMs
    });
  } catch (error: any) {
    console.error('Failed to fetch products:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.get('/api/seed', async (req, res) => {
    try {
        const categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Toys', 'Garden', 'Beauty', 'Sports'];
        const totalProducts = 2000;
        const batchSize = 100;

        console.log(`Seeding ${totalProducts} products...`);

        for (let i = 0; i < totalProducts; i += batchSize) {
            const batch = firestoreWriteBatch(db);
            const count = Math.min(batchSize, totalProducts - i);

            for (let j = 0; j < count; j++) {
                const idx = i + j;
                const productRef = firestoreDoc(firestoreCollection(db, 'products'));
                const now = new Date(Date.now() - idx * 1000);
                
                batch.set(productRef, {
                    name: `Product ${idx}`,
                    category: categories[Math.floor(Math.random() * categories.length)],
                    price: Math.floor(Math.random() * 10000) + 500,
                    createdAt: firestoreTimestamp.fromDate(now),
                    updatedAt: firestoreTimestamp.fromDate(now),
                });
            }
            await batch.commit();
        }
        res.json({ message: `Successfully seeded ${totalProducts} products` });
    } catch (error: any) {
        console.error('Seed failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        // Firestore doesn't provide a cheap 'distinct' helper on large collections easily.
        // For 200k documents, querying all is bad. 
        // In a real app, we'd have a separate metadata document.
        // For this task, I'll return a static list or try a limited query.
        const categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Toys', 'Garden', 'Beauty', 'Sports'];
        res.json(categories.sort());
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Vite Middleware for Dev and Static Serving for Prod
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
});
