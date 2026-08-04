import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.jsx";
import Navbar, { NAV_HEIGHT } from "./components/Navbar";

// eslint-disable-next-line react-refresh/only-export-components -- lazy route binding in the app entry, not a component module
const Preferences = lazy(() => import("./pages/Preferences"));
// eslint-disable-next-line react-refresh/only-export-components -- lazy route binding in the app entry, not a component module
const Auth = lazy(() => import("./pages/Auth"));
// eslint-disable-next-line react-refresh/only-export-components -- lazy route binding in the app entry, not a component module
const Onboard = lazy(() => import("./pages/Onboard"));
// eslint-disable-next-line react-refresh/only-export-components -- lazy route binding in the app entry, not a component module
const Dashboard = lazy(() => import("./pages/Dashboard"));

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY}>
      <BrowserRouter>
        <Navbar />
        <div style={{ paddingTop: NAV_HEIGHT }}>
          <Suspense
            fallback={
              <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                Loading…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/preferences" element={<Preferences />} />
              <Route path="/signin" element={<Auth />} />
              <Route path="/onboard" element={<Onboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </div>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>
);
