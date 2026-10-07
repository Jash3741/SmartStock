const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    batchNumber: {
      type: String,
      required: true,
      trim: true,
    },

    manufacturingDate: {
      type: Date,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },

    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
    },

    status: {
      type: String,
      enum: ["active", "expired", "depleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

batchSchema.index({ product: 1 });
batchSchema.index({ expiryDate: 1 });
batchSchema.index({ batchNumber: 1 });

module.exports = mongoose.model("Batch", batchSchema);