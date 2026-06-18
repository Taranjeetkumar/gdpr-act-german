import { configureStore, createSlice } from '@reduxjs/toolkit';

// auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, dbUser: null, loading: true },
  reducers: {
    setUser:   (state, action) => { state.user = action.payload; },
    setDbUser: (state, action) => { state.dbUser = action.payload; },
    setLoading:(state, action) => { state.loading = action.payload; },
    clearAuth: (state) => { state.user = null; state.dbUser = null; state.loading = false; },
  },
});

// consent slice
const consentSlice = createSlice({
  name: 'consent',
  initialState: { consents: {}, loading: false, lastUpdated: null },
  reducers: {
    setConsents: (state, action) => {
      state.consents = action.payload;
      state.lastUpdated = Date.now();
    },
    updateConsent: (state, action) => {
      const { purpose, granted } = action.payload;
      if (state.consents[purpose]) {
        state.consents[purpose].granted = granted;
      }
    },
    setLoading: (state, action) => { state.loading = action.payload; },
  },
});

// ui slice
const uiSlice = createSlice({
  name: 'ui',
  initialState: { toast: null, sidebarOpen: false },
  reducers: {
    showToast: (state, action) => {
      state.toast = { message: action.payload.message, type: action.payload.type || 'success' };
    },
    clearToast: (state) => { state.toast = null; },
    toggleSidebar: (state) => { state.sidebarOpen = !state.sidebarOpen; },
  },
});

export const authActions    = authSlice.actions;
export const consentActions = consentSlice.actions;
export const uiActions      = uiSlice.actions;

export const store = configureStore({
  reducer: {
    auth:    authSlice.reducer,
    consent: consentSlice.reducer,
    ui:      uiSlice.reducer,
  },
});
