const express = require("express");
const app = express();
const path = require("path");
const ejsMate = require("ejs-mate");
const authRouter = require("./routes/auth.routes.js");
const productRouter = require("./routes/product.routes.js");
const cookieParser = require("cookie-parser");
const UserModel = require("./model/user.model.js");
const sessionMange = require("./utils/middelwares/sessions.middelware.js");
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.urlencoded({ extended: true }));
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "/public")));
app.use(cookieParser());
const mongoose = require("mongoose");

mongoose
  .connect("mongodb://127.0.0.1:27017/smartstock")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Connection error:", err));

app.use(express.json());

app.use(sessionMange);

app.use("/api/auth", authRouter);

app.get("/login", (req, res) => {
  if (req.sessionValid && req.user) {
    return res.redirect(`/${req.user.id}/dashboard`);
  }

  res.render("./user/login.ejs");
});

app.get("/signup", (req, res) => {
  res.render("./user/signup.ejs");
});
//DashBoard
app.get("/:id/dashboard", async (req, res) => {
  const { id } = req.params;

  if (!req.sessionValid || !req.user || req.user.id.toString() !== id) {
    return res.redirect("/login");
  }

  const reqUser = await UserModel.findById(id);
  res.render("./user/dashboard.ejs", { reqUser });
});
//Profile
app.get("/:id/user/profile", (req, res) => {
  const { id } = req.params;

  if (!req.sessionValid || !req.user || req.user.id.toString() !== id) {
    return res.redirect("/login");
  }

  res.render("./user/profile.ejs");
});

const categoryRouter = require("./routes/category.routes.js");

app.use("/categories", categoryRouter);

const productController = require("./controllers/product.controller.js");

// Inventory Route (/inventory and /:id/inventory)
app.get("/inventory", productController.inventory);
app.get("/:id/inventory", productController.inventory);

// Products routes (handles /products, /products/new, /:id/products, /:id/products/add, etc.)
app.use("/products", productRouter);
app.use("/:id/products", productRouter);

// Purchase routes (handles /purchases, /purchases/new, /:id/purchases, etc.)
const purchaseRouter = require("./routes/purchase.routes.js");
app.use("/purchases", purchaseRouter);
app.use("/:id/purchases", purchaseRouter);

// Sales routes (handles /sales, /sales/new, /:id/sales, etc.)
const salesRouter = require("./routes/sales.routes.js");
app.use("/sales", salesRouter);
app.use("/:id/sales", salesRouter);


const port = 4000;
app.listen(port, () => {
  console.log(`http://localhost:4000/login`);
});