// services/socket.js
const { io } = require("socket.io-client");

// ⚠️ DO NOT auto-connect
let socket = null;

const getSocket = () => {
  if (!socket) {
    const token = localStorage.getItem("tokenMyhandleProf"); // or however you store JWT

    socket = io("https://chomske.com", {
      transports: ["websocket"], // force websocket (prod best practice)
      autoConnect: false,        // manual control
      auth: {
        token,                   // goes to socketAuth middleware
      },
      withCredentials: true,
    });
  }

  return socket;
};

module.exports = {
  getSocket,
};
