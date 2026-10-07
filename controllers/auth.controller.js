const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const UserModel = require("../model/user.model.js");
const Session = require("../model/session.model.js");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "smartstock-secret";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

module.exports.register = async (req, res) => {
  const { username, email, mobile, password } = req.body;

  const isAlreadyRegistered = await UserModel.findOne({
    $or: [{ username }, { email }, { mobile }],
  });

  if (isAlreadyRegistered) {
    return res.status(409).json({
      message: "Username or Email or Mobile No Already exists!!",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const NewUser = await UserModel.create({
    username,
    email,
    mobile,
    password: passwordHash,
  });

  const refreshToken = jwt.sign({ id: NewUser._id }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    maxAge: SESSION_DURATION_MS,
  });

  await Session.create({
    userId: NewUser._id,
    refreshToken,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  });

  return res.redirect("/login");
};

module.exports.getMe = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      message: "Token Not Found!!",
    });
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  const user = await UserModel.findById(decoded.id);

  res.status(200).json({
    message: "User fatched Successfully!!",
    user: {
      username: user.username,
      email: user.email,
    },
  });
};

module.exports.refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      message: "Refresh Token Not Found!!",
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const session = await Session.findOne({
      refreshToken,
      userId: decoded.id,
    });

    if (!session) {
      return res.redirect("/login");
    }

    if (session.expiresAt < new Date()) {
      await Session.deleteOne({ _id: session._id });
      return res.redirect("/login");
    }

    const newRefreshToken = jwt.sign({ id: decoded.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    await Session.updateOne(
      { _id: session._id },
      {
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      }
    );

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: SESSION_DURATION_MS,
    });

    return res.status(200).json({
      message: "Access Token Refresh Successfully!!",
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
};

module.exports.loginAuth = async (req, res) => {
  try {
    const { email, password } = req.body;
    let reqUser = await UserModel.findOne({ email }).select("+password");

    if (!reqUser) {
      return res.status(401).send("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, reqUser.password);
    if (!isMatch) {
      return res.status(401).send("Invalid email or password");
    }

    const refreshToken = jwt.sign({ id: reqUser._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: SESSION_DURATION_MS,
    });

    await Session.create({
      userId: reqUser._id,
      refreshToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    return res.redirect(`/${reqUser._id}/dashboard`);
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};

module.exports.logoutAuth = async (req, res) => {
  const token = req.cookies.refreshToken;

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
  });

  if (token) {
    await Session.deleteOne({ refreshToken: token });
  }

  return res.redirect("/login");
};

