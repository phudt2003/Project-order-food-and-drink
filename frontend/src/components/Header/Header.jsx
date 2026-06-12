import React from "react";
import { assets } from "../../assets/assets";
import "./Header.css";

const Header = () => {
  return (
    <section
      className="hero"
      style={{
        backgroundImage: `url(${assets.header_img})`,
      }}
    >
      <div className="hero-content">
        <h1>
          <span className="hero-title-desktop">Khám Phá Cà Phê & Món Ăn Yêu Thích</span>
          <span className="hero-title-mobile">Cà Phê Ngon, Món Ăn Chuẩn Vị</span>
        </h1>

        <p className="hero-desc-desktop">
          Thưởng thức cà phê pha chế tươi, món ăn ngon và các món ăn nhẹ hấp dẫn từ
          nguyên liệu chất lượng. Thư giãn, làm việc hoặc gặp gỡ bạn bè trong không
          gian quán cà phê ấm cúng.
        </p>
        <p className="hero-desc-mobile">
          Thưởng thức cà phê tươi và món ăn hấp dẫn từ nguyên liệu chất lượng, trong
          không gian ấm cúng để thư giãn, làm việc và gặp gỡ bạn bè.
        </p>
      </div>
    </section>
  );
};

export default Header;
