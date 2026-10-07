const { Router } = require("express");
const authRouter = Router();
const authController = require("../controllers/auth.controller.js");

// POST api/auth/register  
authRouter.post("/register",authController.register);

//GET api/auth/get-me
authRouter.get("/get-me",authController.getMe);

//POST api/auth/refresh-token
authRouter.get("/refresh-token",authController.refreshToken);

//POST api/auth/login
authRouter.post("/login",authController.loginAuth);

//POST api.auth/logout
authRouter.post("/logout",authController.logoutAuth);
module.exports = authRouter;