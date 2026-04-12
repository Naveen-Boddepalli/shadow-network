// config/db.js
// Handles MongoDB connection using Mongoose.
// Called once at server startup.

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1); // Exit if DB fails — app cannot work without it
  }
};

module.exports = connectDB;
