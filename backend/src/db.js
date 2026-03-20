import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[DB] MONGODB_URI not set — running without MongoDB (in-memory only)');
    return;
  }

  try {
    await mongoose.connect(uri, {
      dbName: 'price-royale',
    });
    isConnected = true;
    console.log('[DB] Connected to MongoDB Atlas');
  } catch (err) {
    console.error('[DB] MongoDB connection failed:', err.message);
    console.warn('[DB] Falling back to in-memory storage');
  }
}

export function isDBConnected() {
  return isConnected;
}

export default mongoose;
