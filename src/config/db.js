import mongoose from "mongoose";
import MessageThread from "../models/MessageThread.js";

async function repairMessageThreadIndexes() {
  const collection = MessageThread.collection;
  if (!collection) return;

  // Old social threads may have been inserted with application: null, which collides
  // with the legacy unique application index and breaks Explore upserts.
  await collection.updateMany(
    { source: "social", application: null },
    { $unset: { application: 1 } }
  );

  const indexes = await collection.indexes();
  const applicationIndex = indexes.find((index) => index?.name === "application_1");

  const needsRepair =
    applicationIndex &&
    !applicationIndex.partialFilterExpression &&
    !applicationIndex.sparse;

  if (needsRepair) {
    await collection.dropIndex("application_1");
  }

  await collection.createIndex(
    { application: 1 },
    {
      name: "application_1",
      unique: true,
      partialFilterExpression: { application: { $type: "objectId" } },
    }
  );

  await collection.createIndex(
    { student: 1, company: 1, source: 1 },
    {
      name: "student_1_company_1_source_1",
      unique: true,
      partialFilterExpression: { source: "social" },
    }
  );
}

export default async function connectDB(uri) {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("MongoDB reconnected");
  });
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err?.message || err);
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 15,
  });

  await repairMessageThreadIndexes();

  console.log("MongoDB connected");
}
