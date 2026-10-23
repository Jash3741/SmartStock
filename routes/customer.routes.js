const { Router } = require("express");
const CustController = require("../controllers/customer.controller.js");

const CustRouter = Router();
// Customer dashboard
CustRouter.get("/", CustController.dashboardRender);

// GET Add Customer Form Render
CustRouter.get("/add", CustController.AddCustRender);

// POST ADD Customer
CustRouter.post("/add", CustController.AddCust);

//GET EDIT Customer
CustRouter.get("/:id/edit", CustController.EditCustRender);
CustRouter.put("/:id/edit",CustController.UpdateCustomer);

//GET VIEW CUSTOMER 
CustRouter.get("/:id/view",CustController.ViewCustomer)
module.exports = CustRouter;