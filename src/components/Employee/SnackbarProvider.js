import { createContext, useContext, useState } from "react";
import { Snackbar, Alert } from "@mui/material";

const SnackbarContext = createContext(null);

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used inside SnackbarProvider");
  }
  return context;
};

export const SnackbarProvider = ({ children }) => {
  const [snack, setSnack] = useState({
    open: false,
    message: "",
    severity: "success", // default
  });

  const showSnackbar = (message, severity = "success") => {
    setSnack({
      open: true,
      message,
      severity,
    });
  };

  return (
    <SnackbarContext.Provider value={showSnackbar}>
      {children}

      <Snackbar
        open={snack.open}
        autoHideDuration={2500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          sx={{ fontWeight: 600 }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
};
