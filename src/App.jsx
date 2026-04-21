import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import Manager from "./components/Manager";
import Footer from "./components/Footer";
import AuthPanel from "./components/AuthPanel";

const API_BASE = import.meta.env.VITE_API_URL || "";

function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const showAuthPanel = !isAuthLoading && !(user && token);

  const refreshSession = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      setToken("");
      setUser(null);
      return null;
    }

    const result = await response.json();
    setToken(result.accessToken);
    setUser(result.user);
    return result.accessToken;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      setIsAuthLoading(true);

      try {
        await refreshSession();
      } catch {
        if (!cancelled) {
          setToken("");
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsAuthLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const handleAuthenticated = ({ accessToken: nextToken, user: nextUser }) => {
    setToken(nextToken);
    setUser(nextUser);
  };

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore logout transport errors and clear local state anyway.
    }

    setToken("");
    setUser(null);
  }, []);

  return (
    <div className="app-shell flex min-h-screen flex-col text-slate-950">
      <Navbar user={user} onLogout={handleLogout} />
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(253,230,138,0.6),_transparent_34%),radial-gradient(circle_at_85%_15%,_rgba(125,211,252,0.45),_transparent_28%),linear-gradient(180deg,_#fcfcf7_0%,_#f7f7ef_48%,_#f3f4f6_100%)]"></div>
        <div className="absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(15,23,42,0.06),transparent)]"></div>
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:72px_72px]"></div>
      </div>
      <main className={`flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8 ${showAuthPanel ? "flex items-center" : ""}`}>
        {isAuthLoading ? (
          <div className="panel-surface mx-auto mt-12 max-w-3xl rounded-[2rem] p-8 text-center stagger-in">
            <p className="font-['Sora'] text-2xl font-semibold text-slate-950">Restoring your session</p>
            <p className="mt-3 text-slate-600">Verifying your account and loading your private vault.</p>
          </div>
        ) : user && token ? (
          <Manager token={token} user={user} onLogout={handleLogout} onRefreshSession={refreshSession} />
        ) : (
          <AuthPanel onAuthenticated={handleAuthenticated} />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
