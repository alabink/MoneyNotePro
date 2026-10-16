const mongoose = require('mongoose');

let cached = global.__moneynote_mongo;
if (!cached) {
  cached = global.__moneynote_mongo = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const atlasUri =
    process.env.MONGO_URI ||
    'mongodb+srv://longduongbao13:2StenwB4V3hZiI0Y@bindbl.qo7rouz.mongodb.net/moneynote_pro?retryWrites=true&w=majority';

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(atlasUri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10000,
      })
      .then((conn) => {
        console.log(`✅ MongoDB Online Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch(async (error) => {
        console.error(`❌ Kết nối MongoDB Atlas thất bại: ${error.message}`);
        if (!process.env.VERCEL) {
          console.warn(
            '⚠️ Đang tạm thời chuyển sang MongoDB Local (127.0.0.1:27017) để Server không bị dừng. Hãy kiểm tra lại Username/Password trong mục Database Access trên MongoDB Atlas!'
          );
          try {
            const localConn = await mongoose.connect('mongodb://127.0.0.1:27017/moneynote_pro');
            console.log(`✅ MongoDB Local Fallback Connected: ${localConn.connection.host}/${localConn.connection.name}`);
            return localConn;
          } catch (localErr) {
            cached.promise = null;
            throw error;
          }
        }
        cached.promise = null;
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;
