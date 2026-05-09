import React from 'react'
import './Sidebar.css'
import { NavLink } from 'react-router-dom'
import { t } from '../../i18n'

const IconBase = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="sidebar-icon"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const ProductIcon = () => (
  <IconBase>
    <path d="M4 8l8-4 8 4-8 4-8-4Z" />
    <path d="M4 8v8l8 4 8-4V8" />
    <path d="M12 12v8" />
  </IconBase>
);

const CategoryIcon = () => (
  <IconBase>
    <path d="M3 7h7l2 2h9v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z" />
    <path d="M3 10h18" />
  </IconBase>
);

const VoucherIcon = () => (
  <IconBase>
    <path d="M21 9a2 2 0 0 1 0 6v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 0-6V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3Z" />
    <path d="M12 4v16" />
    <path d="M9.5 9.5h.01" />
    <path d="M14.5 14.5h.01" />
  </IconBase>
);

const InventoryIcon = () => (
  <IconBase>
    <path d="M4 7h16" />
    <path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
    <path d="M9 3h6v4H9z" />
  </IconBase>
);

const OrderIcon = () => (
  <IconBase>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="m8 16 2 2 4-4" />
  </IconBase>
);

const ReviewIcon = () => (
  <IconBase>
    <path d="M12 3.5 14.7 9l6 .9-4.3 4.1 1 6-5.4-3-5.4 3 1-6L3.3 9l6-.9L12 3.5Z" />
  </IconBase>
);

const AnalyticsIcon = () => (
  <IconBase>
    <path d="M4 20h16" />
    <path d="M7 16V9" />
    <path d="M12 16V6" />
    <path d="M17 16v-4" />
  </IconBase>
);

const Sidebar = () => {
  const menuItems = [
    { to: '/list', label: t('sidebar.product_manage'), Icon: ProductIcon },
    { to: '/categories', label: t('sidebar.categories'), Icon: CategoryIcon },
    { to: '/vouchers', label: t('sidebar.vouchers'), Icon: VoucherIcon },
    { to: '/inventory', label: t('sidebar.inventory'), Icon: InventoryIcon },
    { to: '/orders', label: t('sidebar.orders'), Icon: OrderIcon },
    { to: '/reviews', label: t('sidebar.reviews'), Icon: ReviewIcon },
    { to: '/stats', label: t('sidebar.analytics'), Icon: AnalyticsIcon },
  ];

  return (
    <div className='sidebar'>
      <div className="sidebar-options">
        {menuItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? "sidebar-option active" : "sidebar-option")}
          >
            <Icon />
            <p>{label}</p>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default Sidebar
