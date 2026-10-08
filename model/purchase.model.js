const mongoose = require("mongoose");

/**
 * Purchase Schema
 * Represents a purchase invoice received from a supplier
 */
const purchaseSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      unique: true,
      trim: true,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },

    purchaseDate: {
      type: Date,
      required: [true, "Purchase date is required"],
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
      required: true,
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
      enum: ["Cash", "UPI", "Card", "Bank", "Credit"],
      default: "Cash",
    },

    paymentStatus: {
      type: String,
      enum: ["Paid", "Partial", "Pending"],
      default: "Paid",
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
  },
  {
    timestamps: true,
  }
);

// Indexes for high performance querying
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
