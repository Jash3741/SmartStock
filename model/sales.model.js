const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },

    saleDate: {
      type: Date,
      default: Date.now,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    gstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    discount: {
      type: Number,
      min: 0,
      default: 0,
    },

    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "card", "bank"],
      default: "cash",
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "partial", "pending"],
      default: "paid",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

saleSchema.index({ saleDate: -1 });
saleSchema.index({ customer: 1 });

module.exports = mongoose.model("Sale", saleSchema);