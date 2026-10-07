const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  username:{
    type:String,
    required:true,
  },
  email:{
    type:String,
    required:true,
  },
  mobile:{
    type:Number,
    required:[true, 'Please provide a valid phone number'],
    unique: true,
    min:1000000000,
    max:9999999999,
  },
  password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
      alias: 'passwordHash',
    },
   isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
   created_at:{
      type:Date,
      default:Date.now(),
    },
});
module.exports = mongoose.model("User",UserSchema);
