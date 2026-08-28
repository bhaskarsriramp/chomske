import jwt from "jsonwebtoken";
const JWT_SECRET = "NidkPwke9485hfKDLAndu9*#&$&$jcbPOqkPkshEYfk3848Asj"



const generateJWTtoken = async (user_id, email) => {

  const token = jwt.sign(
    { user_id: user_id, user_email: email },
    JWT_SECRET,
    { expiresIn: "7d" }

    
  );

  const decoded = jwt.verify(token, JWT_SECRET);

console.log("Token:", token);
console.log("Decoded payload:", decoded);
console.log("Expiry (UTC):", new Date(decoded.exp * 1000));

  return token;
};

export default generateJWTtoken
