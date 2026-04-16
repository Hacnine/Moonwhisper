import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  // Sidebar state
  sidebarOpen: false,

  // Theme state
  theme: "light",

  // Loading states
  loading: {},
  globalLoading: false,

  // Modal states
  modals: {
    createClass: false,
    addMember: false,
    submitAssignment: false,
    markAssignment: false,
    createUser: false,
    editUser: false,
    deleteUser: false,
    blockUser: false,
    unblockUser: false,
    resetPassword: false,
    preventDeletion: false,
    toggleFilePermission: false,
  },

  // Selected items
  selectedUser: null,
  selectedSchedule: null,

  // Notifications/Toasts
  notifications: [],

  // Filters and pagination
  filters: {
    users: {
      search: "",
      status: "",
      role: "",
      page: 1,
      limit: 20,
    },
    logs: {
      action: "",
      severity: "",
      admin: "",
      page: 1,
      limit: 50,
    },
  },
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    // Sidebar actions
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload;
    },

    // Theme actions
    setTheme: (state, action) => {
      state.theme = action.payload;
    },

    // Loading actions
    setLoading: (state, action) => {
      const { key, loading } = action.payload;
      state.loading[key] = loading;
    },
    setGlobalLoading: (state, action) => {
      state.globalLoading = action.payload;
    },

    // Modal actions
    openModal: (state, action) => {
      const { modalName, data } = typeof action.payload === "object" ? action.payload : { modalName: action.payload, data: null };
      state.modals[modalName] = true;
      if (data) {
        if (modalName.includes("User") || modalName === "resetPassword" || modalName === "toggleFilePermission") {
          state.selectedUser = data;
        } else if (modalName.includes("Deletion") || modalName === "preventDeletion") {
          state.selectedSchedule = data;
        }
      }
    },
    closeModal: (state, action) => {
      const modalName = action.payload;
      state.modals[modalName] = false;
      if (modalName.includes("User") || modalName === "resetPassword" || modalName === "toggleFilePermission") {
        state.selectedUser = null;
      } else if (modalName.includes("Deletion") || modalName === "preventDeletion") {
        state.selectedSchedule = null;
      }
    },
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach((key) => {
        state.modals[key] = false;
      });
      state.selectedUser = null;
      state.selectedSchedule = null;
    },

    // Notification/Toast actions
    addNotification: (state, action) => {
      const notification = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        ...action.payload,
      };
      state.notifications.unshift(notification);
      if (state.notifications.length > 50) {
        state.notifications = state.notifications.slice(0, 50);
      }
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload
      );
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },

    // Filter actions
    updateFilter: (state, action) => {
      const { filterType, updates } = action.payload;
      if (state.filters[filterType]) {
        state.filters[filterType] = { ...state.filters[filterType], ...updates };
      }
    },
    resetFilters: (state, action) => {
      const filterType = action.payload;
      if (filterType && state.filters[filterType]) {
        state.filters[filterType] = initialState.filters[filterType];
      } else {
        state.filters = initialState.filters;
      }
    },
     addToast: (state, action) => {
      state.toasts.push({
        id: Date.now(),
        ...action.payload,
      })
    },
    removeToast: (state, action) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload)
    },
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  setTheme,
  setLoading,
  setGlobalLoading,
  openModal,
  closeModal,
  closeAllModals,
  addNotification,
  removeNotification,
  clearNotifications,
  updateFilter,
  resetFilters,
  addToast, 
  removeToast 
} = uiSlice.actions;

export default uiSlice.reducer;

// Selectors
export const selectSidebarOpen = (state) => state.ui.sidebarOpen;
export const selectTheme = (state) => state.ui.theme;
export const selectLoading = (state) => state.ui.loading;
export const selectGlobalLoading = (state) => state.ui.globalLoading;
export const selectModals = (state) => state.ui.modals;
export const selectSelectedUser = (state) => state.ui.selectedUser;
export const selectSelectedSchedule = (state) => state.ui.selectedSchedule;
export const selectNotifications = (state) => state.ui.notifications;
export const selectFilters = (state) => state.ui.filters;