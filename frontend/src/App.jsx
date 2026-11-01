import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuthPage from "./pages/AuthPage";
import AttendeeHub from "./pages/AttendeeHub";
import VotingPage from "./pages/VotingPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLiveResultsPage from "./pages/AdminLiveResultsPage";

// Instantiate TanStack Query client with caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10, // 10s caching for concurrent users
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/hub" element={<AttendeeHub />} />
          <Route path="/vote" element={<VotingPage />} />
          {/* Public /admin is locked & redirects to attendee root */}
          <Route path="/admin" element={<Navigate to="/" replace />} />
          {/* Secret Admin Routes */}
          <Route path="/8980932798801248120247491248142/admin" element={<AdminDashboard />} />
          <Route path="/8980932798801248120247491248142/results" element={<AdminLiveResultsPage />} />
          <Route path="/8980932798801248120247491248142" element={<Navigate to="/8980932798801248120247491248142/admin" replace />} />
          {/* Admin Live Results Projector Routes */}
          <Route path="/live-results" element={<AdminLiveResultsPage />} />
          <Route path="/admin/results" element={<AdminLiveResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
