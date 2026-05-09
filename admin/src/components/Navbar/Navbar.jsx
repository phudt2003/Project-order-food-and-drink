import React from 'react'
import './Navbar.css'
import { assets } from '../../assets/assets.js'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/authStore.jsx'

const Navbar = () => {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className='navbar'>
      <Link to="/" className="brand-link">
        <span className="logo-wrap">
          <img
            className='logo'
            src={assets.logo}
            alt="logo"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = '/logo.png'
            }}
          />
        </span>
      </Link>
      <div className="profile-menu">
        <button type="button" className="profile-button" aria-label="Tài khoản admin">
          <img className='profile' src={assets.profile_image} alt="" />
        </button>
        <div className="profile-dropdown" role="menu">
          <button type="button" className="profile-dropdown-item" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )
}

export default Navbar
