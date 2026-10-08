/**
 * Authentication Guard Middleware
 * Ensures the user has an active, valid session before allowing access
 */
function requireAuth(req, res, next) {
  if (req.sessionValid && req.user && req.user.id) {
    return next();
  }

  // If request is AJAX/API, return JSON 401
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in to continue.",
    });
  }

  // Otherwise redirect to login page
  return res.redirect("/login");
}

module.exports = requireAuth;

