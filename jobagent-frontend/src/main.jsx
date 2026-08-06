import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
// eslint-disable-next-line react-refresh/only-export-components -- lazy route binding in the app entry, not a component module
const Search = lazy(() => import("./pages/Search"));

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// eslint-disable-next-line react-refresh/only-export-components -- app entry, not a component module
function NavbarWrapper() {
  const location = useLocation();
  if (location.pathname === '/') return null;
  return <Navbar />;
}

// eslint-disable-next-line react-refresh/only-export-components -- app entry, not a component module
function ContentWrapper({ children }) {
  const location = useLocation();
  const pad = location.pathname === '/' ? 0 : NAV_HEIGHT;
  return <div style={{ paddingTop: pad }}>{children}</div>;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <BrowserRouter>
        <NavbarWrapper />
        <ContentWrapper>
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
              <Route path="/search" element={<Search />} />
            </Routes>
          </Suspense>
        </ContentWrapper>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>
);
