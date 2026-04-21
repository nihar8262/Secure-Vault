import { useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

const defaultForm = {
  name: "",
  email: "",
  password: "",
};

const AuthPanel = ({ onAuthenticated }) => {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAccountPassword, setShowAccountPassword] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handleSubmit = async () => {
    if (mode === "register" && form.name.trim().length < 2) {
      toast.error("Enter your name to create an account.");
      return;
    }

    if (!form.email.trim() || form.password.length < 10) {
      toast.error("Use a valid email and a password with at least 10 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = mode === "register"
        ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password };
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Authentication failed");
      }

      onAuthenticated(result);
      setForm(defaultForm);
      toast.success(mode === "register" ? "Account created." : "Signed in.");
    } catch (error) {
      toast.error(error.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ToastContainer position="bottom-right" autoClose={1800} closeOnClick pauseOnHover theme="light" />
      <section className="mx-auto w-full max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="vault-gradient rounded-[2rem] px-6 py-8 text-white shadow-[0_28px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10">
            <p className="text-sm uppercase tracking-[0.35em] text-white/70">Authenticated vault</p>
            <h1 className="mt-3 font-['Sora'] text-3xl font-semibold tracking-tight sm:text-5xl">
              Private vaults are now isolated per account.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
              Sign in to your own workspace, then unlock your vault with a separate master password derived via Argon2id in the browser.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Auth</p>
                <p className="mt-2 text-lg font-semibold">JWT session</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Vault KDF</p>
                <p className="mt-2 text-lg font-semibold">Argon2id</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Backend</p>
                <p className="mt-2 text-lg font-semibold">Validated + rate-limited</p>
              </div>
            </div>
          </div>

          <div className="panel-surface rounded-[2rem] p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-700">
              {mode === "register" ? "Create account" : "Sign in"}
            </p>
            <h2 className="mt-3 font-['Sora'] text-3xl font-semibold tracking-tight text-slate-950">
              {mode === "register" ? "Set up your private workspace" : "Access your vault"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your account password secures access to the backend. Your master password still controls vault decryption separately.
            </p>

            <div className="mt-6 space-y-4">
              {mode === "register" && (
                <label className="block text-sm font-medium text-slate-700">
                  Name
                  <div className="field-shell mt-2 rounded-2xl px-4 py-3">
                    <input
                      className="w-full bg-transparent outline-none"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your name"
                    />
                  </div>
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Email
                <div className="field-shell mt-2 rounded-2xl px-4 py-3">
                  <input
                    className="w-full bg-transparent outline-none"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                  />
                </div>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Account password
                <div className="field-shell mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    name="password"
                    type={showAccountPassword ? "text" : "password"}
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 10 characters"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSubmit();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccountPassword((currentValue) => !currentValue)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:text-slate-950"
                  >
                    {showAccountPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700 disabled:opacity-60"
              >
                {isSubmitting ? "Please wait" : mode === "register" ? "Create account" : "Sign in"}
              </button>
              <button
                onClick={() => setMode((currentMode) => (currentMode === "register" ? "login" : "register"))}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-slate-950"
              >
                {mode === "register" ? "I already have an account" : "Create a new account"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default AuthPanel;