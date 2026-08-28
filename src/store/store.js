import { configureStore } from "@reduxjs/toolkit";
import creatorReducer from './professionalSlice';
import participantReducer from './participantSlice';

const persistedStateJSON = localStorage.getItem("professionalDetails");
const participantPersistedStateJSON = localStorage.getItem("participantDetails");

const persistedState = persistedStateJSON
  ? JSON.parse(persistedStateJSON)
  : {};


  const participantPersistedState = participantPersistedStateJSON
  ? JSON.parse(participantPersistedStateJSON)
  : {};


const store = configureStore({
    reducer: {
        professionalUser: creatorReducer,
        participantUser: participantReducer,

    },
    preloadedState: {
        professionalUser: persistedState,
        participantUser: participantPersistedState,
    },

})

export default store;