import { createSlice } from "@reduxjs/toolkit";

const storedState = JSON.parse(localStorage.getItem("professionalDetails"));

const professionalUserSlice = createSlice({
    name: 'userProfessional',
    
    initialState: {
        isLoggedIn: storedState?.isLoggedIn || false,
        user_email: storedState?.user_email || '',
        user_id: storedState?.user_id || '',
    },

    reducers: {
       
          login: (state, action) => {
                    state.isLoggedIn = true;
                    state.user_email = action.payload.user_email;
                    state.user_id = action.payload.user_id;
                
                    const professionalDetails = {
                      isLoggedIn: state.isLoggedIn,
                      user_email: state.user_email,
                      user_id: state.user_id,
                     
                    };
                
                    localStorage.setItem("professionalDetails", JSON.stringify(professionalDetails));
                  },

        logout: (state) => {
            state.isLoggedIn = false;
            state.user_email = '';
            state.user_id = '';
           
            localStorage.removeItem("professionalDetails");
        },
    },

});

export const { login, logout } = professionalUserSlice.actions;
export default professionalUserSlice.reducer;