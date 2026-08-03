import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.jsx";

// eslint-disable-next-line react-refresh/only-export-components -- lazy route binding in the app entry, not a component module
const Preferences = lazy(() => import("./pages/Preferences"));

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY}>
      <BrowserRouter>
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
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>
);
