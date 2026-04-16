import { createSlice } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { userApi } from "../api/user/userApi";

// Initial State
const initialState = {
  user: null,
  themeIndex: null,
  isAuthenticated: null, // 👈 Tracks login status: true / false / null (initial)
  loading: false,
  error: null,
};

// Slice Definition
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user } = action.payload;
      state.user = user;
      state.themeIndex = user?.themeIndex ?? null;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user = null;
      state.themeIndex = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    reset: () => initialState,
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(userApi.endpoints.login.matchPending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(userApi.endpoints.login.matchFulfilled, (state, action) => {
        state.loading = false;
        const user = action.payload.user;
        state.user = user;
        state.themeIndex = user?.themeIndex ?? null;
        state.isAuthenticated = true; // 👈 Marks login success
      })
      .addMatcher(userApi.endpoints.login.matchRejected, (state, action) => {
        state.user = null;
        state.themeIndex = null;
        state.loading = false;
        state.error = action.payload?.data?.message || "Login failed";
        state.isAuthenticated = false; // 👈 Marks login failure
      })
      .addMatcher(
        userApi.endpoints.getUserProfile.matchFulfilled,
        (state, action) => {
          state.loading = false;
          const user = action.payload.user; // Or action.payload, depending on response
          state.user = user;
          state.themeIndex = user?.themeIndex ?? null;
          state.isAuthenticated = true;
        }
      );
  },
});

// Actions & Reducer
export const { setCredentials, logout, clearError, reset } = authSlice.actions;
export default authSlice.reducer;

// Selectors
export const selectCurrentUser = (state) => state.auth.user;
export const selectThemeIndex = (state) => state.auth.themeIndex;
export const selectAuthLoading = (state) => state.auth.loading;
export const selectAuthError = (state) => state.auth.error;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;

// Hooks
export const useUser = () => useSelector((state) => state.auth);
export const useThemeIndex = () => useSelector((state) => state.auth);
