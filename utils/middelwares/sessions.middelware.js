require("dotenv").config();
const Session = require("../../model/session.model.js");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "smartstock-secret";

async function sessionMange(req, res, next) {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return next();
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const session = await Session.findOne({ refreshToken, userId: decoded.id });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await Session.deleteOne({ _id: session._id });
      }

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
      });

      return next();
    }

    req.user = { id: decoded.id };
    req.sessionValid = true;
  } catch (error) {
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    });
  }

  next();
}

module.exports = sessionMange;