const { Router } = require("express");
const categoryRouter = Router();
const categoryController = require("../controllers/category.controller.js");

categoryRouter.get("/", categoryController.getAllCategories);
categoryRouter.post("/", categoryController.createCategory);

module.exports = categoryRouter;

