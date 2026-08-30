import jwt from "jsonwebtoken";
import RevokedToken from "../models/RevokedToken.js";
const JWT_SECRET = process.env.JWT_SECRET;

// const authenticateToken = (req, res, next) => {
//   const token = req.cookies.token || req.headers["authorization"];
// //   console.log("🔵 Received Token:", token);

//   if (!token) {
//       console.log("⚠️ No token provided");
//       return res.status(401).json({ message: "Unauthorized" });
//   }

//   jwt.verify(token, JWT_SECRET, (err, user) => {
//       if (err) {
//           console.error("❌ Token verification failed:", err);
//           return res.status(403).json({ message: "Forbidden" });
//       }
//     //   console.log("✅ Token Verified:", user);
//       req.user = user;
//       next();
//   });
// };

const authenticateToken = async (req, res, next) => {
  let token = req.cookies.token;

  if (!token && req.headers["authorization"]) {
    const authHeader = req.headers["authorization"];
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7, authHeader.length).trim();
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);

    // Check revocation list (only for tokens that carry a jti claim)
    if (user.jti) {
      const revoked = await RevokedToken.exists({ jti: user.jti });
      if (revoked) {
        return res.status(401).json({ message: "Unauthorized: Token has been revoked" });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};


export default authenticateToken
