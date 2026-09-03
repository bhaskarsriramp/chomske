/**
 * api.js — the one axios instance.
 *
 * withCredentials is the important line: the session lives in an httpOnly cookie,
 * so without it every authenticated call is anonymous and 401s.
 */
import axios from "axios";

export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8001";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
});

/** Pull the human-readable message out of whatever shape the failure took. */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  return (
    err?.response?.data?.message ||
    (err?.code === "ECONNABORTED" ? "That took too long. Please try again." : null) ||
    (!err?.response ? "Can't reach the server. Check your connection." : null) ||
    fallback
  );
}

export default api;
