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
      enum: ["cash", "upi", "card", "bank", "Cash", "UPI", "Card", "Bank"],
      default: "cash",
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "partial", "pending", "Paid", "Partial", "Pending"],
      default: "paid",
    },

    paidAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    remainingAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    duedate: {
      type:Date,
      default:Date.now(),
    }   
  },
  {
    timestamps: true,
  }
);

saleSchema.index({ saleDate: -1 });
saleSchema.index({ customer: 1 });

module.exports = mongoose.model("Sale", saleSchema);