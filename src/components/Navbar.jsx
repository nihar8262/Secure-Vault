const Navbar = ({ user, onLogout }) => {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-900/10 bg-white/75 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="font-['Sora'] text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            Secure Vault
          </p>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Encrypted password workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-right shadow-sm sm:block">
              <p className="text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          )}
          {user && (
            <button
              onClick={onLogout}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:text-slate-950"
            >
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
