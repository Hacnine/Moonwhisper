import { createSlice } from '@reduxjs/toolkit';

/**
 * Call state slice - manages the current call state globally.
 * This is separate from call history (handled by callApi RTK Query).
 */
const initialState = {
  // Current call state
  activeCall: null, // { callId, callType, isGroup, conversationId, roomId, calleeInfo }
  callStatus: 'idle', // idle | ringing | incoming | connecting | ongoing | ended

  // Incoming call data (shown in IncomingCallDialog)
  incomingCall: null, // { callId, callerId, callerName, callerImage, callType, conversationId, isGroup }

  // Participants in current call
  participants: [], // [{ userId, userName, userImage, hasAudio, hasVideo }]

  // Local media state
  localAudio: true,
  localVideo: false,
  screenSharing: false,

  // Call timer
  callStartTime: null,

  // UI state
  isMinimized: false,
  showCallScreen: false,
};

const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    // Outgoing call initiated (caller side)
    setCallInitiated: (state, action) => {
      const { callId, callType, calleeId, conversationId, calleeInfo } = action.payload;
      state.activeCall = {
        callId,
        callType,
        isGroup: false,
        conversationId,
        calleeInfo: calleeInfo || { id: calleeId },
      };
      state.callStatus = 'ringing';
      state.localVideo = callType === 'video';
      state.showCallScreen = true;
    },

    // Group call initiated
    setGroupCallInitiated: (state, action) => {
      const { callId, callType, roomId, conversationId } = action.payload;
      state.activeCall = { callId, callType, isGroup: true, conversationId, roomId };
      state.callStatus = 'ringing';
      state.localVideo = callType === 'video';
      state.showCallScreen = true;
    },

    // Incoming call received (callee side)
    setIncomingCall: (state, action) => {
      state.incomingCall = action.payload;
      state.callStatus = 'incoming';
    },

    // Call accepted (by either party)
    setCallAccepted: (state, action) => {
      const { callId, callType } = action.payload;
      if (state.incomingCall) {
        // I'm the callee - build activeCall from incomingCall data
        state.activeCall = {
          callId: state.incomingCall.callId,
          callType: state.incomingCall.callType,
          isGroup: state.incomingCall.isGroup || false,
          conversationId: state.incomingCall.conversationId,
          roomId: state.incomingCall.roomId,
          calleeInfo: {
            id: state.incomingCall.callerId,
            name: state.incomingCall.callerName,
            image: state.incomingCall.callerImage,
          },
        };
        state.localVideo = state.incomingCall.callType === 'video';
        state.incomingCall = null;
      }
      state.callStatus = 'connecting';
      state.showCallScreen = true;
    },

    // Call connected (media flowing)
    setCallConnected: (state) => {
      state.callStatus = 'ongoing';
      if (!state.callStartTime) {
        state.callStartTime = Date.now();
      }
    },

    // Call ended
    setCallEnded: (state) => {
      state.callStatus = 'ended';
      state.activeCall = null;
      state.incomingCall = null;
      state.participants = [];
      state.localAudio = true;
      state.localVideo = false;
      state.screenSharing = false;
      state.callStartTime = null;
      state.showCallScreen = false;
      state.isMinimized = false;
    },

    // Incoming call cleared
    clearIncomingCall: (state) => {
      state.incomingCall = null;
      if (state.callStatus === 'incoming') {
        state.callStatus = 'idle';
      }
    },

    // Participant management
    addParticipant: (state, action) => {
      const exists = state.participants.find((p) => p.userId === action.payload.userId);
      if (!exists) {
        state.participants.push(action.payload);
      }
    },

    removeParticipant: (state, action) => {
      state.participants = state.participants.filter((p) => p.userId !== action.payload.userId);
    },

    updateParticipantMedia: (state, action) => {
      const { userId, hasAudio, hasVideo } = action.payload;
      const participant = state.participants.find((p) => p.userId === userId);
      if (participant) {
        if (hasAudio !== undefined) participant.hasAudio = hasAudio;
        if (hasVideo !== undefined) participant.hasVideo = hasVideo;
      }
    },

    // Local media toggles
    toggleLocalAudio: (state) => {
      state.localAudio = !state.localAudio;
    },

    toggleLocalVideo: (state) => {
      state.localVideo = !state.localVideo;
    },

    toggleScreenSharing: (state) => {
      state.screenSharing = !state.screenSharing;
    },

    // UI state
    setMinimized: (state, action) => {
      state.isMinimized = action.payload;
    },

    setShowCallScreen: (state, action) => {
      state.showCallScreen = action.payload;
    },
  },
});

export const {
  setCallInitiated,
  setGroupCallInitiated,
  setIncomingCall,
  setCallAccepted,
  setCallConnected,
  setCallEnded,
  clearIncomingCall,
  addParticipant,
  removeParticipant,
  updateParticipantMedia,
  toggleLocalAudio,
  toggleLocalVideo,
  toggleScreenSharing,
  setMinimized,
  setShowCallScreen,
} = callSlice.actions;

// Selectors
export const selectActiveCall = (state) => state.call?.activeCall;
export const selectCallStatus = (state) => state.call?.callStatus;
export const selectIncomingCall = (state) => state.call?.incomingCall;
export const selectCallParticipants = (state) => state.call?.participants;
export const selectLocalMedia = (state) => ({
  audio: state.call?.localAudio,
  video: state.call?.localVideo,
  screenSharing: state.call?.screenSharing,
});
export const selectCallStartTime = (state) => state.call?.callStartTime;
export const selectIsMinimized = (state) => state.call?.isMinimized;
export const selectShowCallScreen = (state) => state.call?.showCallScreen;

export default callSlice.reducer;
