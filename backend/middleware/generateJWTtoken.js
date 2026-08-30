import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
const JWT_SECRET = process.env.JWT_SECRET;

const generateJWTtoken = async (user_id, email) => {
  const jti = randomUUID();
  const token = jwt.sign(
    { user_id: user_id, user_email: email, jti },
    JWT_SECRET,
    { expiresIn: "72h" }
  );
  return token;
};

export default generateJWTtoken
