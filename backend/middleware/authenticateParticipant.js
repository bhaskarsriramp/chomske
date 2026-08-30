import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;


const authenticateParticipant = (req, res, next) => {
  const token = req.cookies.tokenParticipantMyHandle || req.headers["authorization"];

  if (!token) {
      console.log("⚠️ No token provided");
      return res.status(401).json({ message: "Unauthorized" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
          console.error("❌ Token verification failed:", err);
          return res.status(403).json({ message: "Forbidden" });
      }
      req.user = user;
      next();
  });
};


export default authenticateParticipant
