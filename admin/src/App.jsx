import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Add from './pages/Add/Add'
import List from './pages/List/List'
import Orders from './pages/Orders/OrdersPage'
import CategoryList from './pages/Categories/CategoryList'
import AddCategory from './pages/Categories/AddCategory'
import EditCategory from './pages/Categories/EditCategory'
import Vouchers from './pages/Vouchers/Vouchers'
import ReviewsPage from './pages/Reviews/Reviews'
import DashboardStats from './pages/DashboardStats/DashboardStats'
import InventoryModule from './pages/Inventory/InventoryModule'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { API_URLS, pickApiBase } from './config/api'
import Login from './pages/Login/Login'
import RequireAuth from './components/RequireAuth'
import AdminLayout from './components/AdminLayout'

const App = ({ apiBase }) => {
  const [url, setUrl] = useState(apiBase || API_URLS[0] || '')

  useEffect(() => {
    let alive = true

    const resolveBase = async () => {
      const picked = await pickApiBase()
      if (alive && picked) setUrl(picked)
    }

    resolveBase()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login apiBase={url} />} />

        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="list" replace />} />
          <Route path="add" element={<Add url={url} />} />
          <Route path="list" element={<List url={url} />} />
          <Route path="categories" element={<CategoryList />} />
          <Route path="categories/add" element={<AddCategory />} />
          <Route path="categories/edit/:id" element={<EditCategory />} />
          <Route path="vouchers" element={<Vouchers url={url} />} />
          <Route path="inventory" element={<InventoryModule url={url} />} />
          <Route path="orders" element={<Orders url={url} />} />
          <Route path="reviews" element={<ReviewsPage url={url} />} />
          <Route path="stats" element={<DashboardStats url={url} />} />
        </Route>

        <Route path="*" element={<Navigate to="/list" replace />} />
      </Routes>
    </div>
  )
}

export default App
