import { useCallback, useEffect, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { createVaultMeta, decryptValue, deriveVaultKey, encryptValue } from "../utils/vaultCrypto";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = import.meta.env.VITE_API_URL || "";
const AUTO_LOCK_STORAGE_KEY = "secure-vault:auto-lock-minutes";
const defaultForm = { id: "", site: "", username: "", password: "", category: "Personal" };
const categories = ["All", "Personal", "Work", "Social", "Finance", "Shopping", "Other"];
const strengthTone = {
  Weak: "bg-rose-500",
  Medium: "bg-amber-400",
  Strong: "bg-emerald-500",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const formatRecordDate = (value) => {
  if (!value) {
    return "Unknown";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return dateFormatter.format(parsedDate);
};

const normalizeSiteValue = (site) => site.trim();

const ensureUrl = (site) => {
  const value = normalizeSiteValue(site);

  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value}`;
};

const isValidSiteUrl = (site) => {
  try {
    const parsedUrl = new URL(ensureUrl(site));
    return Boolean(parsedUrl.hostname);
  } catch {
    return false;
  }
};

const getSiteHost = (site) => {
  try {
    return new URL(ensureUrl(site)).hostname;
  } catch {
    return site;
  }
};

const getFaviconUrl = (site) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getSiteHost(site))}&sz=64`;

const getSecretState = (item, decryptedPasswords) => {
  if (item.encryptionStatus === "legacy-plaintext") {
    return {
      value: "Legacy plaintext record",
      canReveal: false,
      canCopy: false,
      note: "Saved before encryption was added. Re-save this entry to encrypt it.",
    };
  }

  if (item.encryptionStatus === "missing-secret") {
    return {
      value: "Missing encrypted secret",
      canReveal: false,
      canCopy: false,
      note: "This entry does not contain a usable stored password.",
    };
  }

  const decryptedValue = decryptedPasswords[item.id];

  if (!decryptedValue || decryptedValue === "Unavailable") {
    return {
      value: "Unavailable",
      canReveal: false,
      canCopy: false,
      note: "The stored secret could not be decrypted with the current vault key.",
    };
  }

  return {
    value: decryptedValue,
    canReveal: true,
    canCopy: true,
    note: "",
  };
};

const getPasswordStrength = (password) => {
  let score = 0;

  if (password.length >= 8) {
    score += 1;
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) {
    score += 1;
  }

  if (/\d/.test(password)) {
    score += 1;
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  }

  if (score <= 2) {
    return { label: "Weak", progress: 34, hint: "Add length, mixed case, numbers, and symbols." };
  }

  if (score <= 4) {
    return { label: "Medium", progress: 68, hint: "Good start. Push length or add another character type." };
  }

  return { label: "Strong", progress: 100, hint: "Strong enough for most accounts." };
};

const pickRandom = (charset) => {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return charset[values[0] % charset.length];
};

const shuffleString = (value) => {
  const characters = value.split("");

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    const randomIndex = values[0] % (index + 1);
    [characters[index], characters[randomIndex]] = [characters[randomIndex], characters[index]];
  }

  return characters.join("");
};

const buildGeneratedPassword = ({ length, numbers, symbols }) => {
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%^&*()_-+=?";
  let charset = `${lowercase}${uppercase}`;
  let generated = `${pickRandom(lowercase)}${pickRandom(uppercase)}`;

  if (numbers) {
    charset += digits;
    generated += pickRandom(digits);
  }

  if (symbols) {
    charset += special;
    generated += pickRandom(special);
  }

  while (generated.length < length) {
    generated += pickRandom(charset);
  }

  return shuffleString(generated).slice(0, length);
};

const renderStrengthBadge = (label) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
      label === "Strong"
        ? "bg-emerald-100 text-emerald-700"
        : label === "Medium"
          ? "bg-amber-100 text-amber-700"
          : "bg-rose-100 text-rose-700"
    }`}
  >
    {label}
  </span>
);

const Manager = ({ token, user, onLogout, onRefreshSession }) => {
  const autoLockStorageKey = `${AUTO_LOCK_STORAGE_KEY}:${user.id}`;
  const [form, setForm] = useState(defaultForm);
  const [vaultMeta, setVaultMeta] = useState(null);
  const [passwordArray, setPasswordArray] = useState([]);
  const [decryptedPasswords, setDecryptedPasswords] = useState({});
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmMasterPassword, setConfirmMasterPassword] = useState("");
  const [showSetupMasterPassword, setShowSetupMasterPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [generator, setGenerator] = useState({ length: 18, numbers: true, symbols: true });
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => Number(window.localStorage.getItem(autoLockStorageKey)) || 3);
  const lockTimerRef = useRef(null);
  const vaultKeyRef = useRef(null);

  const strength = getPasswordStrength(form.password);
  const duplicatePasswordIds = new Set();
  const passwordBuckets = {};

  Object.entries(decryptedPasswords).forEach(([id, value]) => {
    if (!value) {
      return;
    }

    const bucketKey = value;
    passwordBuckets[bucketKey] = [...(passwordBuckets[bucketKey] || []), id];
  });

  Object.values(passwordBuckets).forEach((bucket) => {
    if (bucket.length > 1) {
      bucket.forEach((id) => duplicatePasswordIds.add(id));
    }
  });

  const filteredPasswords = passwordArray.filter((item) => {
    const searchValue = searchTerm.trim().toLowerCase();
    const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;

    if (!matchesCategory) {
      return false;
    }

    if (!searchValue) {
      return true;
    }

    const site = item.site.toLowerCase();
    const username = item.username.toLowerCase();

    if (searchField === "site") {
      return site.includes(searchValue);
    }

    if (searchField === "username") {
      return username.includes(searchValue);
    }

    return site.includes(searchValue) || username.includes(searchValue);
  });

  const weakCount = passwordArray.filter((item) => item.passwordStrength === "Weak").length;
  const duplicateCount = duplicatePasswordIds.size;
  const duplicateMatchesCurrent = Object.entries(decryptedPasswords).some(
    ([id, value]) => id !== form.id && value === form.password,
  );
  const formWarnings = [];

  if (form.password && strength.label === "Weak") {
    formWarnings.push("This password is weak.");
  }

  if (form.password && duplicateMatchesCurrent) {
    formWarnings.push("This password is already used in another entry.");
  }

  const resetForm = () => {
    setForm(defaultForm);
    setShowFormPassword(false);
  };

  const authorizedFetch = useCallback(async (path, options = {}, hasRetried = false) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401 && !hasRetried) {
      const nextAccessToken = await onRefreshSession();

      if (nextAccessToken) {
        return fetch(`${API_BASE}${path}`, {
          ...options,
          credentials: "include",
          headers: {
            Authorization: `Bearer ${nextAccessToken}`,
            ...(options.headers || {}),
          },
        });
      }
    }

    if (response.status === 401) {
      toast.error("Your session expired. Please sign in again.");
      await onLogout();
      throw new Error("Unauthorized");
    }

    return response;
  }, [onLogout, onRefreshSession, token]);

  useEffect(() => {
    setVaultMeta(null);
    setPasswordArray([]);
    setDecryptedPasswords({});
    setVisiblePasswords({});
    setIsVaultUnlocked(false);

    const run = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const [metaResponse, passwordsResponse] = await Promise.all([
          authorizedFetch(`/api/meta`),
          authorizedFetch(`/api/passwords`),
        ]);

        if (!metaResponse.ok || !passwordsResponse.ok) {
          throw new Error("Unable to load vault data.");
        }

        const meta = await metaResponse.json();
        const passwords = await passwordsResponse.json();
        setVaultMeta(meta);
        setPasswordArray(passwords);
      } catch {
        toast.error("Unable to reach the vault service.");
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [authorizedFetch, token]);

  useEffect(() => {
    if (!isVaultUnlocked || !vaultKeyRef.current) {
      setDecryptedPasswords({});
      return undefined;
    }

    let cancelled = false;

    const decryptPasswords = async () => {
      const nextPasswords = {};

      await Promise.all(
        passwordArray.map(async (item) => {
          try {
            nextPasswords[item.id] = await decryptValue(item.passwordCiphertext, item.passwordIv, vaultKeyRef.current);
          } catch {
            nextPasswords[item.id] = "Unavailable";
          }
        }),
      );

      if (!cancelled) {
        setDecryptedPasswords(nextPasswords);
      }
    };

    decryptPasswords();

    return () => {
      cancelled = true;
    };
  }, [isVaultUnlocked, passwordArray]);

  useEffect(() => {
    window.localStorage.setItem(autoLockStorageKey, String(autoLockMinutes));
  }, [autoLockMinutes, autoLockStorageKey]);

  useEffect(() => {
    if (!isVaultUnlocked) {
      if (lockTimerRef.current) {
        window.clearTimeout(lockTimerRef.current);
      }

      return undefined;
    }

    const resetLockTimer = () => {
      if (lockTimerRef.current) {
        window.clearTimeout(lockTimerRef.current);
      }

      lockTimerRef.current = window.setTimeout(() => {
        vaultKeyRef.current = null;
        setIsVaultUnlocked(false);
        setVisiblePasswords({});
        setShowFormPassword(false);
        toast.info("Vault locked after inactivity.");
      }, autoLockMinutes * 60 * 1000);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetLockTimer));
    document.addEventListener("visibilitychange", resetLockTimer);
    resetLockTimer();

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, resetLockTimer));
      document.removeEventListener("visibilitychange", resetLockTimer);

      if (lockTimerRef.current) {
        window.clearTimeout(lockTimerRef.current);
      }
    };
  }, [autoLockMinutes, isVaultUnlocked]);

  const lockVault = () => {
    vaultKeyRef.current = null;
    setIsVaultUnlocked(false);
    setVisiblePasswords({});
    setShowFormPassword(false);
    toast.info("Vault locked.");
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const openWebsite = (site) => {
    const targetUrl = ensureUrl(site);

    if (!isValidSiteUrl(targetUrl)) {
      toast.error("This website URL is not valid.");
      return;
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const handleCreateVault = async () => {
    if (masterPassword.length < 10) {
      toast.error("Use at least 10 characters for the master password.");
      return;
    }

    if (masterPassword !== confirmMasterPassword) {
      toast.error("Master passwords do not match.");
      return;
    }

    try {
      const meta = await createVaultMeta(masterPassword);
      const response = await authorizedFetch(`/api/meta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(meta),
      });

      if (!response.ok) {
        throw new Error("Unable to initialize vault");
      }

      const result = await response.json();
      const { key } = await deriveVaultKey(masterPassword, meta);
      vaultKeyRef.current = key;
      setVaultMeta(result.metadata || meta);
      setIsVaultUnlocked(true);
      setMasterPassword("");
      setConfirmMasterPassword("");
      toast.success("Vault created and unlocked.");
    } catch {
      toast.error("Unable to create the vault right now.");
    }
  };

  const handleUnlockVault = async () => {
    if (!vaultMeta) {
      toast.error("Vault metadata is missing.");
      return;
    }

    try {
      const result = await deriveVaultKey(unlockPassword, vaultMeta);

      if (result.verifier !== vaultMeta.verifier) {
        toast.error("Incorrect master password.");
        return;
      }

      vaultKeyRef.current = result.key;
      setIsVaultUnlocked(true);
      setUnlockPassword("");
      toast.success("Vault unlocked.");
    } catch {
      toast.error("Unable to unlock the vault.");
    }
  };

  const handleGeneratePassword = () => {
    const generatedPassword = buildGeneratedPassword(generator);
    setForm((currentForm) => ({ ...currentForm, password: generatedPassword }));
    setShowFormPassword(true);
  };

  const handleSavePassword = async () => {
    if (!isVaultUnlocked || !vaultKeyRef.current) {
      toast.error("Unlock the vault before saving.");
      return;
    }

    const site = ensureUrl(form.site);
    const username = form.username.trim();
    const password = form.password;

    if (site.length < 3 || username.length < 3 || password.length < 8) {
      toast.error("Site, username, and a stronger password are required.");
      return;
    }

    if (!isValidSiteUrl(site)) {
      toast.error("Enter a valid website URL.");
      return;
    }

    try {
      const encryptedValue = await encryptValue(password, vaultKeyRef.current);
      const id = form.id || uuidv4();
      const payload = {
        id,
        site,
        username,
        category: form.category,
        passwordStrength: getPasswordStrength(password).label,
        hasSymbols: /[^A-Za-z0-9]/.test(password),
        hasNumbers: /\d/.test(password),
        ...encryptedValue,
      };
      const method = form.id ? "PUT" : "POST";
      const endpoint = form.id ? `/api/passwords/${form.id}` : `/api/passwords`;
      const response = await authorizedFetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Unable to save password");
      }

      const result = await response.json();
      const savedRecord = result.record;

      setPasswordArray((currentPasswords) => {
        const nextPasswords = form.id
          ? currentPasswords.map((item) => (item.id === form.id ? savedRecord : item))
          : [savedRecord, ...currentPasswords];

        return nextPasswords.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
      resetForm();
      toast.success(form.id ? "Password updated." : "Password saved.");
    } catch {
      toast.error("Unable to save the password.");
    }
  };

  const handleDeletePassword = async (id) => {
    const confirmed = window.confirm("Delete this password entry?");

    if (!confirmed) {
      return;
    }

    try {
      const response = await authorizedFetch(`/api/passwords/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete password");
      }

      setPasswordArray((currentPasswords) => currentPasswords.filter((item) => item.id !== id));
      toast.success("Password deleted.");
    } catch {
      toast.error("Unable to delete the password.");
    }
  };

  const handleEditPassword = (item) => {
    setForm({
      id: item.id,
      site: item.site,
      username: item.username,
      password: decryptedPasswords[item.id] || "",
      category: item.category || "Personal",
    });
    setShowFormPassword(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords((currentState) => ({ ...currentState, [id]: !currentState[id] }));
  };

  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleExport = () => {
    if (passwordArray.length === 0) {
      toast.info("No encrypted passwords available to export.");
      return;
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      vaultMeta,
      passwords: passwordArray,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `secure-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    toast.success("Encrypted backup exported.");
  };

  if (!token || !user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="panel-surface mx-auto mt-12 max-w-5xl rounded-[2rem] p-8 text-center stagger-in">
        <p className="font-['Sora'] text-2xl font-semibold text-slate-950">Loading your vault</p>
        <p className="mt-3 text-slate-600">Connecting to the vault service and preparing encrypted records.</p>
      </div>
    );
  }

  return (
    <>
      <ToastContainer position="bottom-right" autoClose={1800} closeOnClick pauseOnHover theme="light" />
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="vault-gradient stagger-in overflow-hidden rounded-[2rem] px-6 py-8 text-white shadow-[0_28px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-[0.35em] text-white/70">Secure by default</p>
              <h1 className="mt-3 font-['Sora'] text-3xl font-semibold tracking-tight sm:text-5xl">
                {user.name}, your passwords are encrypted before they reach MongoDB.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
                Searchable site and username fields stay fast inside your private account. Secret values unlock only after the correct master password is derived in this browser with Argon2id.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-white/85 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Entries</p>
                <p className="mt-2 text-2xl font-semibold text-white">{passwordArray.length}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Weak</p>
                <p className="mt-2 text-2xl font-semibold text-white">{weakCount}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Duplicates</p>
                <p className="mt-2 text-2xl font-semibold text-white">{duplicateCount}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-white/60">Auto-lock</p>
                <p className="mt-2 text-2xl font-semibold text-white">{autoLockMinutes}m</p>
              </div>
            </div>
          </div>
        </div>

        {!vaultMeta ? (
          <div className="panel-surface stagger-in mx-auto w-full max-w-2xl rounded-[2rem] p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-700">Initialize vault</p>
            <h2 className="mt-3 font-['Sora'] text-3xl font-semibold tracking-tight text-slate-950">
              Create a master password
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The master password is never stored. An Argon2id-derived key encrypts each saved password locally with AES-GCM.
            </p>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Master password
                <div className="field-shell mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    type={showSetupMasterPassword ? "text" : "password"}
                    value={masterPassword}
                    onChange={(event) => setMasterPassword(event.target.value)}
                    placeholder="Use a long passphrase"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupMasterPassword((currentValue) => !currentValue)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:text-slate-950"
                  >
                    {showSetupMasterPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Confirm master password
                <div className="field-shell mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    type={showSetupConfirmPassword ? "text" : "password"}
                    value={confirmMasterPassword}
                    onChange={(event) => setConfirmMasterPassword(event.target.value)}
                    placeholder="Repeat the same passphrase"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupConfirmPassword((currentValue) => !currentValue)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:text-slate-950"
                  >
                    {showSetupConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </div>
            <button
              onClick={handleCreateVault}
              className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700"
            >
              Create encrypted vault
            </button>
          </div>
        ) : !isVaultUnlocked ? (
          <div className="panel-surface stagger-in mx-auto w-full max-w-2xl rounded-[2rem] p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-700">Vault locked</p>
            <h2 className="mt-3 font-['Sora'] text-3xl font-semibold tracking-tight text-slate-950">Unlock with your master password</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your encrypted records are already loaded. Decryption happens only after the verifier matches in this session.
            </p>
            <label className="mt-6 block text-sm font-medium text-slate-700">
              Master password
              <div className="field-shell mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
                <input
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  type={showUnlockPassword ? "text" : "password"}
                  value={unlockPassword}
                  onChange={(event) => setUnlockPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleUnlockVault();
                    }
                  }}
                  placeholder="Enter master password"
                />
                <button
                  type="button"
                  onClick={() => setShowUnlockPassword((currentValue) => !currentValue)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:text-slate-950"
                >
                  {showUnlockPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <button
              onClick={handleUnlockVault}
              className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700"
            >
              Unlock vault
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="panel-surface stagger-in rounded-[2rem] p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-700">Vault editor</p>
                  <h2 className="mt-2 font-['Sora'] text-2xl font-semibold tracking-tight text-slate-950">
                    {form.id ? "Edit entry" : "Add a new login"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExport}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-slate-950"
                  >
                    Export encrypted JSON
                  </button>
                  <button
                    onClick={lockVault}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-slate-950"
                  >
                    Lock now
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="block text-sm font-medium text-slate-700">
                  Website or app
                  <div className="field-shell mt-2 rounded-2xl px-4 py-3">
                    <input
                      className="w-full bg-transparent outline-none"
                      name="site"
                      value={form.site}
                      onChange={handleFormChange}
                      placeholder="github.com or https://example.com"
                    />
                  </div>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Username or email
                    <div className="field-shell mt-2 rounded-2xl px-4 py-3">
                      <input
                        className="w-full bg-transparent outline-none"
                        name="username"
                        value={form.username}
                        onChange={handleFormChange}
                        placeholder="name@example.com"
                      />
                    </div>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Category
                    <div className="field-shell mt-2 rounded-2xl px-4 py-3">
                      <select className="w-full bg-transparent outline-none" name="category" value={form.category} onChange={handleFormChange}>
                        {categories.filter((item) => item !== "All").map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>

                <label className="block text-sm font-medium text-slate-700">
                  Password
                  <div className="field-shell mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      name="password"
                      type={showFormPassword ? "text" : "password"}
                      value={form.password}
                      onChange={handleFormChange}
                      placeholder="Create or paste a password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword((currentValue) => !currentValue)}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:text-slate-950"
                    >
                      {showFormPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                    <span>Password strength</span>
                    {renderStrengthBadge(strength.label)}
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div
                      className={`h-2 rounded-full transition-all ${strengthTone[strength.label]}`}
                      style={{ width: `${strength.progress}%` }}
                    ></div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{strength.hint}</p>
                  {formWarnings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {formWarnings.map((warning) => (
                        <span key={warning} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                          {warning}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSavePassword}
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700"
                  >
                    {form.id ? "Update password" : "Save password"}
                  </button>
                  <button
                    onClick={handleGeneratePassword}
                    className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-slate-950"
                  >
                    Generate password
                  </button>
                  {form.id && (
                    <button
                      onClick={resetForm}
                      className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                    >
                      Cancel editing
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="panel-surface stagger-in rounded-[2rem] p-5 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-700">Generator and controls</p>
              <h2 className="mt-2 font-['Sora'] text-2xl font-semibold tracking-tight text-slate-950">Tune your vault workflow</h2>

              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                    <span>Generated length</span>
                    <span>{generator.length} characters</span>
                  </div>
                  <input
                    className="mt-3 w-full accent-sky-600"
                    type="range"
                    min="10"
                    max="32"
                    value={generator.length}
                    onChange={(event) => setGenerator((currentValue) => ({ ...currentValue, length: Number(event.target.value) }))}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setGenerator((currentValue) => ({ ...currentValue, numbers: !currentValue.numbers }))}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      generator.numbers ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600"
                    }`}
                  >
                    Include numbers
                  </button>
                  <button
                    onClick={() => setGenerator((currentValue) => ({ ...currentValue, symbols: !currentValue.symbols }))}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      generator.symbols ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600"
                    }`}
                  >
                    Include symbols
                  </button>
                </div>

                <label className="block text-sm font-medium text-slate-700">
                  Auto-lock after inactivity
                  <div className="field-shell mt-2 rounded-2xl px-4 py-3">
                    <select
                      className="w-full bg-transparent outline-none"
                      value={autoLockMinutes}
                      onChange={(event) => setAutoLockMinutes(Number(event.target.value))}
                    >
                      <option value="1">1 minute</option>
                      <option value="3">3 minutes</option>
                      <option value="5">5 minutes</option>
                    </select>
                  </div>
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                  <p>Search stays fast because site and username remain readable metadata.</p>
                  <p className="mt-2">Only password values are encrypted and exported as encrypted JSON for backup.</p>
                </div>
              </div>
            </div>

            <div className="panel-surface stagger-in rounded-[2rem] p-5 sm:p-6 lg:col-span-2">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-700">Passwords</p>
                  <h2 className="mt-2 font-['Sora'] text-2xl font-semibold tracking-tight text-slate-950">Search, filter, and act quickly</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[560px]">
                  <div className="field-shell rounded-2xl px-4 py-3">
                    <input
                      className="w-full bg-transparent outline-none"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search passwords..."
                    />
                  </div>
                  <div className="field-shell rounded-2xl px-4 py-3">
                    <select className="w-full bg-transparent outline-none" value={searchField} onChange={(event) => setSearchField(event.target.value)}>
                      <option value="all">Search site or username</option>
                      <option value="site">Search site only</option>
                      <option value="username">Search username only</option>
                    </select>
                  </div>
                  <div className="field-shell rounded-2xl px-4 py-3">
                    <select className="w-full bg-transparent outline-none" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {filteredPasswords.length === 0 ? (
                <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50/80 p-10 text-center text-slate-500">
                  No passwords match the current search or filter.
                </div>
              ) : (
                <>
                  <div className="mt-8 hidden overflow-hidden rounded-[1.5rem] border border-slate-200 md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-left">
                      <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-5 py-4 font-semibold">Site</th>
                          <th className="px-5 py-4 font-semibold">Username</th>
                          <th className="px-5 py-4 font-semibold">Password</th>
                          <th className="px-5 py-4 font-semibold">Meta</th>
                          <th className="px-5 py-4 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white/70 text-sm text-slate-700">
                        {filteredPasswords.map((item) => {
                          const isVisible = Boolean(visiblePasswords[item.id]);
                          const secretState = getSecretState(item, decryptedPasswords);
                          const duplicateDetected = duplicatePasswordIds.has(item.id);

                          return (
                            <tr key={item.id}>
                              <td className="px-5 py-4 align-top">
                                <div className="flex items-start gap-3">
                                  <img src={getFaviconUrl(item.site)} alt="" className="mt-0.5 h-6 w-6 rounded-md" />
                                  <div>
                                    <button
                                      type="button"
                                      onClick={() => openWebsite(item.site)}
                                      className="cursor-pointer text-left font-semibold text-slate-900 transition hover:text-sky-700"
                                    >
                                      {getSiteHost(item.site)}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openWebsite(item.site)}
                                      className="mt-1 block cursor-pointer text-xs text-slate-500 transition hover:text-sky-700"
                                    >
                                      {item.site}
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <p className="font-medium text-slate-900">{item.username}</p>
                                <button onClick={() => copyValue(item.username, "Username")} className="mt-2 text-xs font-semibold text-sky-700">
                                  Copy username
                                </button>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="max-w-[220px]">
                                  <p className={`truncate font-medium text-slate-900 transition ${isVisible && secretState.canReveal ? "blur-0" : "blur-sm select-none"}`}>
                                    {secretState.value}
                                  </p>
                                  {secretState.note && <p className="mt-2 text-xs text-amber-700">{secretState.note}</p>}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      onClick={() => secretState.canReveal && togglePasswordVisibility(item.id)}
                                      className={`text-xs font-semibold ${secretState.canReveal ? "text-sky-700" : "cursor-not-allowed text-slate-400"}`}
                                    >
                                      {secretState.canReveal ? (isVisible ? "Hide" : "Show") : "Show unavailable"}
                                    </button>
                                    <button
                                      onClick={() => secretState.canCopy && copyValue(secretState.value, "Password")}
                                      className={`text-xs font-semibold ${secretState.canCopy ? "text-sky-700" : "cursor-not-allowed text-slate-400"}`}
                                    >
                                      Copy password
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{item.category}</span>
                                  {renderStrengthBadge(item.passwordStrength)}
                                  {duplicateDetected && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Duplicate</span>}
                                  {item.encryptionStatus === "legacy-plaintext" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Migration needed</span>}
                                </div>
                                <p className="mt-3 text-xs text-slate-500">Created {formatRecordDate(item.createdAt)}</p>
                                <p className="text-xs text-slate-500">Updated {formatRecordDate(item.updatedAt)}</p>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="flex flex-col items-start gap-2 text-xs font-semibold text-slate-700">
                                  <button onClick={() => handleEditPassword(item)} className="rounded-full border border-slate-300 px-3 py-1.5 transition hover:border-sky-300 hover:text-slate-950">
                                    Edit
                                  </button>
                                  <button onClick={() => handleDeletePassword(item.id)} className="rounded-full border border-rose-200 px-3 py-1.5 text-rose-700 transition hover:bg-rose-50">
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-8 grid gap-4 md:hidden">
                    {filteredPasswords.map((item) => {
                      const isVisible = Boolean(visiblePasswords[item.id]);
                      const secretState = getSecretState(item, decryptedPasswords);
                      const duplicateDetected = duplicatePasswordIds.has(item.id);

                      return (
                        <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white/85 p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <img src={getFaviconUrl(item.site)} alt="" className="h-10 w-10 rounded-xl" />
                              <div>
                                <button
                                  type="button"
                                  onClick={() => openWebsite(item.site)}
                                  className="cursor-pointer text-left font-semibold text-slate-950 transition hover:text-sky-700"
                                >
                                  {getSiteHost(item.site)}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openWebsite(item.site)}
                                  className="mt-1 block cursor-pointer text-left text-xs text-slate-500 transition hover:text-sky-700"
                                >
                                  {item.site}
                                </button>
                                <p className="mt-1 text-sm text-slate-500">{item.username}</p>
                              </div>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{item.category}</span>
                          </div>

                          <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                            <p className={`truncate text-sm font-medium text-slate-900 transition ${isVisible && secretState.canReveal ? "blur-0" : "blur-sm select-none"}`}>
                              {secretState.value}
                            </p>
                            {secretState.note && <p className="mt-2 text-xs text-amber-700">{secretState.note}</p>}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => secretState.canReveal && togglePasswordVisibility(item.id)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${secretState.canReveal ? "border-slate-300 text-slate-700" : "cursor-not-allowed border-slate-200 text-slate-400"}`}
                              >
                                {secretState.canReveal ? (isVisible ? "Hide" : "Show") : "Show unavailable"}
                              </button>
                              <button onClick={() => copyValue(item.username, "Username")} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                Copy username
                              </button>
                              <button
                                onClick={() => secretState.canCopy && copyValue(secretState.value, "Password")}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${secretState.canCopy ? "border-slate-300 text-slate-700" : "cursor-not-allowed border-slate-200 text-slate-400"}`}
                              >
                                Copy password
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {renderStrengthBadge(item.passwordStrength)}
                            {duplicateDetected && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Duplicate password</span>}
                            {item.encryptionStatus === "legacy-plaintext" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Migration needed</span>}
                          </div>

                          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                            <span>Updated {formatRecordDate(item.updatedAt)}</span>
                            <div className="flex gap-2">
                              <button onClick={() => handleEditPassword(item)} className="font-semibold text-sky-700">Edit</button>
                              <button onClick={() => handleDeletePassword(item.id)} className="font-semibold text-rose-700">Delete</button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default Manager;
