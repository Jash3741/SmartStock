const { Router } = require("express");
const ProductRouter = Router({ mergeParams: true });
const ProductController = require("../controllers/product.controller.js");

// GET /products or /products/inventory or /:id/products
ProductRouter.get("/", ProductController.inventory);
ProductRouter.get("/inventory", ProductController.inventory);


// Add Product Routes
ProductRouter.get("/new", ProductController.renderAddProduct);
ProductRouter.get("/add", ProductController.renderAddProduct);
ProductRouter.post("/new", ProductController.newProduct);
ProductRouter.post("/", ProductController.newProduct);

// Product Details / Edit / Delete
ProductRouter.get("/:id/edit", ProductController.renderEditProduct);
ProductRouter.post("/:id/edit", ProductController.updateProduct);
ProductRouter.put("/:id", ProductController.updateProduct);
ProductRouter.delete("/:id", ProductController.deleteProduct);
ProductRouter.post("/:id/delete", ProductController.deleteProduct);
ProductRouter.get("/:id", ProductController.getProductDetails);

module.exports = ProductRouter;