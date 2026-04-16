import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  messages: [],
  currentMessage: null,
  editingMessage: null,
  replyingMessage: null, // New state for the message being replied to
};

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {

    editMessage: (state, action) => {
      state.editingMessage = action.payload;
    },
    replyMessage: (state, action) => {
      state.replyingMessage = action.payload; // Set the message being replied to
    },
    clearReplyingMessage: (state) => { 
      state.replyingMessage = null;
    },
    clearEditingMessage: (state) => { 
      state.replyingMessage = null;
    },
  },
});

export const { editMessage, replyMessage , clearReplyingMessage, clearEditingMessage} = messagesSlice.actions;
export default messagesSlice.reducer;