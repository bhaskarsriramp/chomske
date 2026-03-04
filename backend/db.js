
import mongoose from "mongoose";

const username = 'myhandlein_db_user';
const password = process.env.MONGODB_PASSWORD;

var dbUrl = 'mongodb+srv://'+username+':'+password+'@cluster0.itfkrwb.mongodb.net/?appName=Cluster0';


let isConnected = false;

const connectToMongo = async () => {
  if (isConnected) {
    console.log("🟢 MongoDB already connected");
    return;
  }

  try {
    console.log("🔌 Connecting to MongoDB...");

    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", false); // 🚨 IMPORTANT

    await mongoose.connect(dbUrl, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1); // fail fast
  }
};

export default connectToMongo;
