

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userID: { type: String, unique: true },
  name: String,
  orders: [
    {
      meals: String,
      total: Number,
      date: { type: Date, default: Date.now }
    }
  ],
  cart: []
});

const oderSchema = new mongoose.Schema({
    meals: String,
    total: Number,
    date: {type: Date, default: Date.now }
})

const User = mongoose.model("User", userSchema);
module.exports = { User };