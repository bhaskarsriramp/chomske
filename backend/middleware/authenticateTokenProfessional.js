import jwt from "jsonwebtoken";
import RevokedToken from "../models/RevokedToken.js";
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateTokenProfessional = async (req, res, next) => {
  let token = req.cookies.tokenMyhandleProf;

  // Support Bearer token from Authorization header (strips the "Bearer " prefix)
  if (!token && req.headers["authorization"]) {
    const authHeader = req.headers["authorization"];
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);

    // Check revocation list so that logout tokens cannot be reused
    if (user.jti) {
      const revoked = await RevokedToken.exists({ jti: user.jti });
      if (revoked) {
        return res.status(401).json({ message: "Unauthorized: Token has been revoked" });
      }
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};


export default authenticateTokenProfessional
