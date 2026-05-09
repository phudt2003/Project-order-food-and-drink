import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { assets } from "../assets/assets.js";
import { useAuth } from "../store/authStore.jsx";

const Header = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (event) => {
      const node = menuRef.current;
      if (!node) return;
      if (node.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-color)] bg-white/85 backdrop-blur">
      <div className="flex h-[var(--navbar-height)] items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <img
            className="h-10 w-10 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-alt)] p-1 object-contain"
            src={assets.logo}
            alt="Coffee Bingo"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/logo.png";
            }}
          />
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-[var(--text-primary)]">Coffee Bingo</div>
            <div className="text-xs text-stone-500">Admin Dashboard</div>
          </div>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
            aria-haspopup="menu"
            aria-expanded={open ? "true" : "false"}
            onClick={() => setOpen((prev) => !prev)}
          >
            <img
              className="h-8 w-8 rounded-full border border-[var(--border-color)] object-cover"
              src={assets.profile_image}
              alt=""
            />
            <span className="hidden sm:inline">Admin</span>
          </button>

          {open ? (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[var(--border-color)] bg-white p-1 shadow-lg">
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] hover:bg-[var(--bg-surface-alt)]"
                onClick={handleLogout}
              >
                Đăng xuất
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default Header;

