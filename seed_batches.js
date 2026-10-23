const mongoose = require("mongoose");
const Product = require("./model/product.model.js");
const Batch = require("./model/batch.model.js");
const Supplier = require("./model/supplier.model.js");
require("dotenv").config();
async function seedBatches() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB for batch seeding.");

    const supplier = await Supplier.findOne();
    const products = await Product.find({ status: "active" });

    for (const prod of products) {
      if ((prod.quantity || 0) <= 0) continue;

      const existingBatches = await Batch.find({ product: prod._id, quantity: { $gt: 0 } });
      if (existingBatches.length > 0) continue; // already has batches

      const now = new Date();
      const halfQty = Math.floor(prod.quantity / 2);
      const remainingQty = prod.quantity - halfQty;

      // If quantity is small, create 1 batch
      if (prod.quantity <= 5) {
        await Batch.create({
          product: prod._id,
          batchNumber: `BAT-${prod.sku.slice(-3)}-01`,
          manufacturingDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
          expiryDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
          purchasePrice: prod.purchasePrice || 50,
          sellingPrice: prod.sellingPrice || 80,
          quantity: prod.quantity,
          supplier: supplier ? supplier._id : undefined,
          status: "active",
        });
      } else {
        // Create 2 batches with different expiry dates to showcase FEFO:
        // Batch 1: Earlier expiry (6 months)
        await Batch.create({
          product: prod._id,
          batchNumber: `BAT-${prod.sku.slice(-3)}-A`,
          manufacturingDate: new Date(now.getFullYear(), now.getMonth() - 3, 1),
          expiryDate: new Date(now.getFullYear(), now.getMonth() + 6, 1),
          purchasePrice: prod.purchasePrice || 50,
          sellingPrice: prod.sellingPrice || 80,
          quantity: halfQty,
          supplier: supplier ? supplier._id : undefined,
          status: "active",
        });

        // Batch 2: Later expiry (18 months)
        await Batch.create({
          product: prod._id,
          batchNumber: `BAT-${prod.sku.slice(-3)}-B`,
          manufacturingDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          expiryDate: new Date(now.getFullYear() + 1, now.getMonth() + 6, 1),
          purchasePrice: prod.purchasePrice || 50,
          sellingPrice: prod.sellingPrice || 80,
          quantity: remainingQty,
          supplier: supplier ? supplier._id : undefined,
          status: "active",
        });
      }
    }

    console.log("Batches seeded successfully for all in-stock products!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding batches:", err);
    process.exit(1);
  }
}

seedBatches();

