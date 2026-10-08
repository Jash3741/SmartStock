const { Router } = require("express");
const purchaseRouter = Router({ mergeParams: true });
const purchaseController = require("../controllers/purchase.controller.js");
const requireAuth = require("../utils/middelwares/auth.middelware.js");

// Apply authentication middleware to all purchase routes
purchaseRouter.use(requireAuth);

// GET /purchases - Purchase History list
purchaseRouter.get("/", purchaseController.renderPurchaseHistory);

// GET /purchases/new - New Purchase Entry form
purchaseRouter.get("/new", purchaseController.renderNewPurchase);

// POST /purchases - Create purchase with transaction safety
purchaseRouter.post("/", purchaseController.createPurchase);

// POST /purchases/api/supplier - Quick create supplier helper from modal
purchaseRouter.post("/api/supplier", purchaseController.quickCreateSupplier);

// GET /purchases/:id - View single purchase invoice
purchaseRouter.get("/:id", purchaseController.getPurchaseDetails);

module.exports = purchaseRouter;

