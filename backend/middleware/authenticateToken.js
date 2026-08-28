import jwt from "jsonwebtoken";
const JWT_SECRET = "NidkPwke9485hfKDLAndu9*#&$&$jcbPOqkPkshEYfk3848Asj"

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

const authenticateToken = (req, res, next) => {
  let token = req.cookies.token;

  if (!token && req.headers["authorization"]) {
    // Expecting header format: 'Bearer <token>'
    const authHeader = req.headers["authorization"];
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7, authHeader.length).trim();
    }
  }

  if (!token) {
    console.log("⚠️ No token provided");
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("❌ Token verification failed:", err);
      // Use 401 Unauthorized here for expired/invalid token, it's more standard
      return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};


export default authenticateToken
