import mongoose from "mongoose";
import reviewModel from "../models/Review.js";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`DB Connected: ${mongoose.connection.name}`);

    try {
      await reviewModel.syncIndexes();
      console.log("Review indexes synced.");
    } catch (indexError) {
      console.warn("Review index sync failed:", indexError?.message || indexError);
    }
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
};
