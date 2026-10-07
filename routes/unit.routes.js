const { Router } = require("express");
const unitRouter = Router();
const unitController = require("../controllers/unit.controller.js");

unitRouter.get("/", unitController.getAllUnits);
unitRouter.post("/", unitController.createUnit);

module.exports = unitRouter;

