import { useState, useEffect, useCallback } from 'react';
import { Package, Search, Filter, ChevronRight, RefreshCw, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  writeBatch as firestoreWriteBatch,
  doc as firestoreDoc,
  Timestamp as firestoreTimestamp 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "",
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const firebaseApp = initializeApp(firebaseConfig);
const clientDb = getFirestore(firebaseApp, "(default)");

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  createdAt: string;
  updatedAt: string;
}

interface Cursor {
  value: any;
  id: string;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc'>('newest');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      } else {
        throw new Error('Backend failed');
      }
    } catch (err) {
      console.warn('Categories API failed, falling back to static categories:', err);
      setCategories(['Electronics', 'Clothing', 'Home', 'Books', 'Toys', 'Garden', 'Beauty', 'Sports'].sort());
    }
  };

  const fetchProducts = useCallback(async (cursor: Cursor | null = null, reset: boolean = false) => {
    setLoading(true);
    const startTime2 = performance.now();
    try {
      let url = `/api/products?limit=25&sortBy=${sortBy}`;
      if (selectedCategory) url += `&category=${encodeURIComponent(selectedCategory)}`;
      if (debouncedSearchTerm) url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;
      if (cursor) {
        url += `&cursorValue=${cursor.value}&cursorId=${cursor.id}`;
      }

      let data: any = null;
      let nextCursorData: any = null;
      let serverExecTime: number | null = null;
      let ok = false;

      // Try calling Express backend (API route proxy)
      try {
        const res = await fetch(url);
        if (res.ok) {
          const result = await res.json();
          if (result.data) {
            data = result.data;
            nextCursorData = result.nextCursor;
            serverExecTime = result.executionTimeMs;
            ok = true;
          }
        }
      } catch (fetchErr) {
        console.warn('Backend API failed, resorting to direct Firestore browser fallback:', fetchErr);
      }

      // If backend was down/not running (e.g. static host like Vercel build), query Firestore client-side
      if (!ok) {
        console.log('🔄 Fetching directly from Google Firestore via client SDK...');
        let q: any = firestoreCollection(clientDb, 'products');

        if (selectedCategory) {
          q = firestoreQuery(q, firestoreWhere('category', '==', selectedCategory));
        }

        if (debouncedSearchTerm) {
          const formattedSearch = debouncedSearchTerm.charAt(0).toUpperCase() + debouncedSearchTerm.slice(1);
          q = firestoreQuery(
            q,
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

        if (cursor) {
          let lastValue: any;
          if (debouncedSearchTerm) {
            lastValue = cursor.value; // Name string
          } else if (sortBy === 'price_asc') {
            lastValue = Number(cursor.value);
          } else {
            lastValue = firestoreTimestamp.fromMillis(Number(cursor.value));
          }
          q = firestoreQuery(q, firestoreStartAfter(lastValue, cursor.id));
        }

        const snapshot = await firestoreGetDocs(firestoreQuery(q, firestoreLimit(25)));
        data = snapshot.docs.map(doc => {
          const d = doc.data() as any;
          return {
            id: doc.id,
            name: d.name || '',
            category: d.category || '',
            price: d.price || 0,
            createdAt: d.createdAt ? (d.createdAt as firestoreTimestamp).toDate().toISOString() : new Date().toISOString(),
            updatedAt: d.updatedAt ? (d.updatedAt as firestoreTimestamp).toDate().toISOString() : new Date().toISOString()
          };
        });

        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (lastDoc) {
          const d = lastDoc.data() as any;
          nextCursorData = {
            value: debouncedSearchTerm ? d.name : (sortBy === 'price_asc' ? d.price : (d.createdAt as firestoreTimestamp).toMillis()),
            id: lastDoc.id
          };
        } else {
          nextCursorData = null;
        }

        const endTime2 = performance.now();
        serverExecTime = parseFloat((endTime2 - startTime2).toFixed(2));
        ok = true;
      }

      if (ok && data) {
        if (reset) {
          setProducts(data);
        } else {
          setProducts(prev => [...prev, ...data]);
        }
        setNextCursor(nextCursorData);
        setExecutionTimeMs(serverExecTime);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [selectedCategory, sortBy, debouncedSearchTerm]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts(null, true);
  }, [selectedCategory, sortBy, debouncedSearchTerm, fetchProducts]);

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min${diffInMinutes > 1 ? 's' : ''} ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-sans selection:bg-black selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-black p-2 rounded-lg">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Inventory Engine</h1>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Performance Toast */}
             <AnimatePresence>
               {showToast && executionTimeMs !== null && (
                 <motion.div
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: 20 }}
                   className="flex items-center gap-2 bg-green-50 border border-green-100 px-3 py-1.5 rounded-full shadow-sm"
                 >
                   <RefreshCw className="w-3 h-3 text-green-600" />
                   <span className="text-[10px] font-mono font-bold text-green-700">
                     EXE: {executionTimeMs}ms
                   </span>
                 </motion.div>
               )}
             </AnimatePresence>

             <div className="flex items-center bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 focus-within:border-black transition-colors">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search products..." 
                  className="bg-transparent border-none outline-none text-sm w-28 sm:w-48 text-[#1a1a1a]"
                />
             </div>
             <div className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
               CLOUD.db | FIRESTORE
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Filters & Sorting */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <section className="overflow-x-auto pb-2 scrollbar-hide flex-1">
            <div className="flex items-center gap-2 min-w-max">
              <Filter className="w-4 h-4 text-gray-500 mr-2" />
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-4 py-1.5 rounded-full text-sm transition-all border ${
                  selectedCategory === '' 
                  ? 'bg-black text-white border-black shadow-lg shadow-black/10' 
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                All Products
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all border ${
                    selectedCategory === cat 
                    ? 'bg-black text-white border-black shadow-lg shadow-black/10' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          <div className="flex items-center gap-2 bg-white border border-gray-200 p-1 rounded-xl">
            <button
              onClick={() => setSortBy('newest')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                sortBy === 'newest' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Newest
            </button>
            <button
              onClick={() => setSortBy('price_asc')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                sortBy === 'price_asc' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Price: low to high
            </button>
          </div>
        </div>

        {/* Product Grid */}
        {initialLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
             <RefreshCw className="w-8 h-8 animate-spin text-gray-300" />
             <p className="text-gray-400 font-mono text-sm tracking-wider">INITIALIZING DATASET...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-dashed border-gray-200">
             <Package className="w-12 h-12 text-gray-200 mb-4" />
             <p className="text-gray-500 font-medium mb-1">No products found in Firestore.</p>
             <p className="text-gray-400 text-sm mb-6">Database might be empty.</p>
             <button 
               onClick={async () => {
                 setLoading(true);
                 try {
                    const res = await fetch('/api/seed');
                    if (!res.ok) {
                      throw new Error('API failed');
                    }
                  } catch (err) {
                    console.log('API seed failed, running client-side seed in browser fallback...', err);
                    const categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Toys', 'Garden', 'Beauty', 'Sports'];
                    const totalProducts = 200;
                    const batch = firestoreWriteBatch(clientDb);
                    for (let i = 0; i < totalProducts; i++) {
                      const productRef = firestoreDoc(firestoreCollection(clientDb, 'products'));
                      const now = new Date(Date.now() - i * 1000);
                      batch.set(productRef, {
                        name: `Product ${i}`,
                        category: categories[Math.floor(Math.random() * categories.length)],
                        price: Math.floor(Math.random() * 10000) + 500,
                        createdAt: firestoreTimestamp.fromDate(now),
                        updatedAt: firestoreTimestamp.fromDate(now),
                      });
                    }
                    await batch.commit();
                  }
                 fetchProducts(null, true);
               }}
               className="bg-black text-white px-6 py-2 rounded-xl text-sm font-medium hover:scale-105 transition-transform"
             >
               Seed Products
             </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {products.map((p, idx) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (idx % 25) * 0.02 }}
                  className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-black transition-all group relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 px-2 py-0.5 bg-gray-50 rounded-md">
                      {p.category}
                    </span>
                    <Package className="w-4 h-4 text-gray-200 group-hover:text-black transition-colors" />
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-1 group-hover:text-black">{p.name}</h3>
                  <p className="text-gray-400 text-xs font-mono mb-2">#{p.id.split('-')[0]}</p>
                  
                  <div className="text-[10px] text-gray-400 uppercase tracking-tighter mb-4 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Latest Action: {getRelativeTime(p.updatedAt)}
                  </div>
                  
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-tighter mb-0.5">Price</p>
                      <p className="text-xl font-bold font-mono tracking-tighter">{formatPrice(p.price)}</p>
                    </div>
                    <button className="bg-gray-50 p-2 rounded-xl group-hover:bg-black group-hover:text-white transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {/* Subtle fade effect for new items */}
                  <div className="absolute inset-0 border-2 border-black opacity-0 group-hover:opacity-10 pointer-events-none rounded-2xl" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Load More */}
        {nextCursor && !initialLoading && (
          <div className="mt-12 flex justify-center">
            <button
              onClick={() => fetchProducts(nextCursor)}
              disabled={loading}
              className="group flex items-center gap-3 bg-white px-8 py-3 rounded-2xl border border-gray-200 hover:border-black transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <>
                  <span className="font-medium">Load More</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                </>
              )}
            </button>
          </div>
        )}
        
        {!nextCursor && !initialLoading && products.length > 0 && (
          <p className="text-center text-gray-400 mt-12 text-sm font-mono tracking-wider">-- END OF DATASET --</p>
        )}
      </main>

      {/* Stats Footer */}
      <footer className="mt-24 border-t border-gray-200 bg-white py-12">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
           <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Total Capacity</p>
              <p className="text-2xl font-bold font-mono tracking-tighter">200,000</p>
           </div>
           <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Pagination Mode</p>
              <p className="text-2xl font-bold font-mono tracking-tighter">KEYSET</p>
           </div>
           <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Indexing</p>
              <p className="text-2xl font-bold font-mono tracking-tighter text-green-600">ACTIVE</p>
           </div>
           <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Engine</p>
              <p className="text-2xl font-bold font-mono tracking-tighter">FIREBASE/NODE</p>
           </div>
        </div>
      </footer>
    </div>
  );
}
