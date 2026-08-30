import jwt from "jsonwebtoken";
import RevokedToken from "../models/RevokedToken.js";
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateAdmin = async (req, res, next) => {
  const token = req.cookies.tokenMyhandleAdmin || req.headers["authorization"];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.jti) {
      const revoked = await RevokedToken.exists({ jti: decoded.jti });
      if (revoked) {
        return res.status(401).json({ message: "Unauthorized: Token has been revoked" });
      }
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

export default authenticateAdmin;
