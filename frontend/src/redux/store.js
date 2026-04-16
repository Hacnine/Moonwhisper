import { configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";
import { setupListeners } from "@reduxjs/toolkit/query";
import conversationReducer from "./slices/conversationSlice";
import uiReducer from "./slices/uiSlice";
import authReducer from "./slices/authSlice";
import messagesReducer from "./slices/messagesSlice";
import { conversationApi } from "./api/conversationApi";
import { quickMessageApi } from "./api/quickMessageApi";
import { lessonApi } from "./api/quickLessonApi";
import { userApi } from "./api/user/userApi";
import { adminApi } from "./api/admin/adminApi";
import { settingsApi } from "./api/admin/settingsApi";
import { userManagementApi } from "./api/admin/userManagementApi";
import { messageApi } from "./api/messageApi";
import { permissionApi } from "./api/permissionApi";
import { persistReducer as persistReducerSingle } from "redux-persist";
import { socialApi } from "./api/social/socialApi";
import { noticeApi } from "./api/admin/noticeApi";
import { notificationApi } from "./api/notificationApi";
import { securityApi } from "./api/securityApi";
import { reminderApi } from "./api/reminderApi";
import { formApi } from "./api/formApi";
import { callApi } from "./api/callApi";
import callReducer from "./slices/callSlice";

// No-op storage for server-side rendering
const createNoopStorage = () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
});

const storageEngine =
  typeof window !== "undefined" ? storage : createNoopStorage();

// Factory function for persist config
const createPersistConfig = (key, options = {}) => ({
  key,
  storage: storageEngine,
  ...options,
});

// Persist configs for each slice
const persistConfigs = {
  auth: createPersistConfig("auth"),
  ui: createPersistConfig("ui", {
    whitelist: ["filters", "notifications", "theme"],
  }),
  userAuth: createPersistConfig("userAuth", { blacklist: ["socket"] }), // Use blacklist for non-serializable
  conversation: createPersistConfig("conversation", {
    whitelist: ["themeIndex", "byConversationId"], // Add byConversationId to persist messages
  }),
};

// Persist config for conversation slice to persist only 'messages'
const conversationPersistConfig = {
  key: "conversation",
  storage: storageEngine,
  whitelist: ["messages"],
};

// Wrap reducers with persistReducer
const reducers = {
  auth: persistReducer(persistConfigs.auth, authReducer),
  ui: persistReducer(persistConfigs.ui, uiReducer),
  conversation: persistReducerSingle(
    persistConfigs.conversation,
    conversationReducer
  ),
  messages: messagesReducer,
  [securityApi.reducerPath]: securityApi.reducer,
  [userApi.reducerPath]: userApi.reducer,
  [messageApi.reducerPath]: messageApi.reducer,
  [conversationApi.reducerPath]: conversationApi.reducer,
  [quickMessageApi.reducerPath]: quickMessageApi.reducer,
  [lessonApi.reducerPath]: lessonApi.reducer,
  [adminApi.reducerPath]: adminApi.reducer,
  [settingsApi.reducerPath]: settingsApi.reducer,
  [userManagementApi.reducerPath]: userManagementApi.reducer,
  [noticeApi.reducerPath]: noticeApi.reducer,
  [notificationApi.reducerPath]: notificationApi.reducer,
  [socialApi.reducerPath]: socialApi.reducer,
  [permissionApi.reducerPath]: permissionApi.reducer,
  [reminderApi.reducerPath]: reminderApi.reducer,
  [formApi.reducerPath]: formApi.reducer,
  [callApi.reducerPath]: callApi.reducer,
  call: callReducer,
};

export const store = configureStore({
  reducer: reducers,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          "userAuth/initializeSocket",
          "userAuth/disconnectSocket",
          "persist/PERSIST",
        ],
        ignoredPaths: ["userAuth.socket"],
      },
    }).concat([
      securityApi.middleware,
      userApi.middleware,
      messageApi.middleware,
      conversationApi.middleware,
      quickMessageApi.middleware,
      lessonApi.middleware,
      adminApi.middleware,
      settingsApi.middleware,
      userManagementApi.middleware,
      noticeApi.middleware,
      notificationApi.middleware,
      socialApi.middleware,
      permissionApi.middleware,
      reminderApi.middleware,
      formApi.middleware,
      callApi.middleware,
    ]),
});

// Enable refetching on focus/network reconnect
setupListeners(store.dispatch);

// Persistor export
export const persistor = persistStore(store);
