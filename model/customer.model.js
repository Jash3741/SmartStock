const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    userId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"customer"
    },
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city:{
      type:String,
    },
    state:{
      type:String,
    },
    pincode:{
      type:Number,
    },
    Cred_limit:{
      type:String,
    },
    Payment_term:{
      type:String,
      enum:["Immediate","7 Days","15 Days","30 Days","Custom"]
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    notes:{
      type:String,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });

module.exports = mongoose.model("Customer", customerSchema);

