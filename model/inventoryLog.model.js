const mongoose = require("mongoose");

const inventoryLogSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "PURCHASE",
        "SALE",
        "RETURN",
        "ADJUSTMENT",
        "DAMAGE",
        "EXPIRED",
      ],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    previousStock: {
      type: Number,
      required: true,
      min: 0,
    },

    newStock: {
      type: Number,
      required: true,
      min: 0,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    note: {
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

inventoryLogSchema.index({ product: 1 });
inventoryLogSchema.index({ batch: 1 });
inventoryLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("InventoryLog", inventoryLogSchema);