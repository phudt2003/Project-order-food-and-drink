import React, { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { API_URLS } from "../../config/api";
import { assets } from "../../assets/assets.js";
import FormInput from "../../components/ui/FormInput";
import { useAuth } from "../../store/authStore";
import "./Login.css";

const initialForm = { username: "", password: "" };

function Login({ apiBase = API_URLS[0] || "" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = useMemo(() => {
    const pathname = location?.state?.from?.pathname;
    return typeof pathname === "string" && pathname.trim() ? pathname : "/list";
  }, [location?.state?.from?.pathname]);

  if (isAuthenticated) {
    return <Navigate to="/list" replace />;
  }

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const result = await login({
        apiBase,
        username: form.username,
        password: form.password,
      });

      if (!result.success) {
        toast.error(result.message || "Sai tài khoản hoặc mật khẩu.");
        return;
      }

      toast.success("Đăng nhập thành công.");
      navigate(redirectTo, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg login-bg--one" />
      <div className="login-bg login-bg--two" />
      <div className="login-bg login-bg--three" />

      <div className="login-container">
        <div className="login-info">
          <div className="login-badge">Coffee Bingo Console</div>
          <h1>Đăng nhập quản trị</h1>
          <p className="login-subtitle">
            Kiểm soát sản phẩm, đơn hàng, voucher và đánh giá từ một nơi.
          </p>

          <div className="login-feature-list">
            <div className="login-feature">
              <span className="login-dot" />
              <p>Theo dõi đơn hàng theo trạng thái, cập nhật nhanh và chính xác.</p>
            </div>
            <div className="login-feature">
              <span className="login-dot" />
              <p>Quản lý sản phẩm, danh mục, giá bán và tuỳ chọn món.</p>
            </div>
            <div className="login-feature">
              <span className="login-dot" />
              <p>Kiểm duyệt đánh giá và điều phối voucher hiệu quả.</p>
            </div>
          </div>

          <div className="login-note">Phiên đăng nhập sẽ hết hạn sau 12 giờ.</div>
        </div>

        <div className="login-form">
          <div className="login-form__head">
            <img
              src={assets.logo}
              alt="Admin"
              className="login-logo"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "/logo.png";
              }}
            />
            <h2>Đăng nhập Admin</h2>
            <p>Vui lòng nhập tài khoản và mật khẩu để tiếp tục.</p>
          </div>

          <form onSubmit={onSubmit} className="login-form__body">
            <FormInput
              label="Tài khoản"
              name="username"
              value={form.username}
              onChange={(event) => setField("username", event.target.value)}
              placeholder="admin"
              required
            />
            <FormInput
              label="Mật khẩu"
              name="password"
              type="password"
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              placeholder="••••••••"
              required
            />
            <button type="submit" disabled={submitting} className="btn btn-confirm login-button">
              {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <p className="login-footnote">
            Đăng xuất sẽ yêu cầu nhập lại tài khoản và mật khẩu.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
