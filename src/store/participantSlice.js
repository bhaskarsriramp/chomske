import { createSlice } from "@reduxjs/toolkit";

const storedState = JSON.parse(localStorage.getItem("particiapantDetails"));

const participantUserSlice = createSlice({
    name: 'userParticipant',
    
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
                
                    const participantDetails = {
                      isLoggedIn: state.isLoggedIn,
                      user_email: state.user_email,
                      user_id: state.user_id,
                     
                    };
                
                    localStorage.setItem("participantDetails", JSON.stringify(participantDetails));
                  },

        logout: (state) => {
            state.isLoggedIn = false;
            state.user_email = '';
            state.user_id = '';
           
            localStorage.removeItem("participantDetails");
        },
    },

});

export const { login, logout } = participantUserSlice.actions;
export default participantUserSlice.reducer;