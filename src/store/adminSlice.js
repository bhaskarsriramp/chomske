import { createSlice } from "@reduxjs/toolkit";

const storedState = JSON.parse(localStorage.getItem("adminDetails"));

const adminSlice = createSlice({
  name: "admin",

  initialState: {
    isLoggedIn: storedState?.isLoggedIn || false,
    admin_email: storedState?.admin_email || "",
    admin_id: storedState?.admin_id || "",
  },

  reducers: {
    adminLogin: (state, action) => {
      state.isLoggedIn = true;
      state.admin_email = action.payload.admin_email;
      state.admin_id = action.payload.admin_id;

      localStorage.setItem(
        "adminDetails",
        JSON.stringify({
          isLoggedIn: true,
          admin_email: state.admin_email,
          admin_id: state.admin_id,
        })
      );
    },

    adminLogout: (state) => {
      state.isLoggedIn = false;
      state.admin_email = "";
      state.admin_id = "";
      localStorage.removeItem("adminDetails");
    },
  },
});

export const { adminLogin, adminLogout } = adminSlice.actions;
export default adminSlice.reducer;
