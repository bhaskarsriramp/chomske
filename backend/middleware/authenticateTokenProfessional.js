import jwt from "jsonwebtoken";
const JWT_SECRET = "NidkPwke9485hfKDLAndu9*#&$&$jcbPOqkPkshEYfk3848Asj"

const authenticateTokenProfessional = (req, res, next) => {
  const token = req.cookies.tokenMyhandleProf || req.headers["authorization"];

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


export default authenticateTokenProfessional
