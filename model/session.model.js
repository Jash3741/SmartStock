const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:true
    },
    refreshToken: {
      type: String,
      required: true
    },

    expiresAt: {
      type: Date,
      required: true
    },

    userAgent: String,
    ipAddress: String
  },
  {
    timestamps: true
  }
);
module.exports = mongoose.model("session",sessionSchema);