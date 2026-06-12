import React from 'react'
import './Footer.css'
import { FaFacebookF, FaLinkedinIn } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'

const Footer = () => {
  return (
    <div className='footer' id='footer'>
      <div className="footer-content">
        <div className="footer-content-left">
          <img src="/logo.png" alt="Coffee Bingo" width="150" height="26" />
          <p>Coffee Bingo mang đến trải nghiệm cà phê và ẩm thực hiện đại, ấm cúng với hương vị được chăm chút mỗi ngày.</p>
          <div className="footer-social-icons">
            <a
              href="https://www.facebook.com/phu.duong.8366"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook Trong Phu"
              className="footer-social-link"
            >
              <FaFacebookF />
            </a>
            <span className="footer-social-link" role="img" aria-label="Twitter">
              <FaXTwitter />
            </span>
            <span className="footer-social-link" role="img" aria-label="LinkedIn">
              <FaLinkedinIn />
            </span>
          </div>
        </div>
        <div className="footer-content-center">
          <h2>CÔNG TY</h2>
          <ul>
            <li>Trang chủ</li>
            <li>Về chúng tôi</li>
            <li>Giao hàng</li>
            <li>Chính sách bảo mật</li>
          </ul>
        </div>
        <div className="footer-content-right">
          <h2>LIÊN HỆ</h2>
          <ul>
            <li>
              SĐT:{" "}
              <a href="tel:+84354512206" aria-label="Gọi số 0354512206">
                0354512206
              </a>
            </li>
            <li>
              Email:{" "}
              <a
                href="mailto:duongtrongphu2003@gmail.com"
                aria-label="Gửi email tới duongtrongphu2003@gmail.com"
              >
                duongtrongphu2003@gmail.com
              </a>
            </li>
          </ul>
        </div>
      </div>
      <hr />
      <p className="footer-copyright">Bản quyền 2026 © TrongPhu.com - Tất cả các quyền được bảo lưu.</p>
    </div>
  )
}

export default Footer
