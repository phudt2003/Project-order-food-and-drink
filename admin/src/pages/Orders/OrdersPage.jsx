import React, { useEffect, useMemo, useState } from 'react'
import http from '../../api/http'
import { toast } from 'react-toastify'
import OrderCard from './OrderCard'
import InvoiceModal from './InvoiceModal'
import MapModal from './MapModal'
import OrderDetailModal from './OrderDetailModal'
import { STATUS_META, normalizeStatus } from './OrderStatusBadge'

const STATUS_TABS = ['all', 'pending', 'preparing', 'delivering', 'completed', 'cancelled']

const getCustomerInfo = (order) => {
  const address = order?.address ?? {}

  const fullName = [address?.firstName, address?.lastName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .trim()

  const name =
    (typeof address?.name === 'string' && address.name.trim()) ||
    fullName ||
    'Khách hàng'

  const phone =
    (typeof address?.phone === 'string' && address.phone.trim()) ||
    (typeof order?.phone === 'string' && order.phone.trim()) ||
    ''

  const detailAddress =
    (typeof address?.deliveryText === 'string' && address.deliveryText.trim()) ||
    (typeof order?.deliveryAddress?.text === 'string' && order.deliveryAddress.text.trim()) ||
    [address?.street, address?.ward, address?.district, address?.city, address?.state, address?.country]
      .filter((part) => typeof part === 'string' && part.trim())
      .join(', ')
      .trim()

  return {
    name,
    phone,
    detailAddress: detailAddress || 'Chưa có địa chỉ',
  }
}

const OrderSkeletonCard = ({ index }) => (
  <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={`skeleton-${index}`}>
    <div className="mb-4 h-4 w-40 rounded bg-slate-200" />
    <div className="grid gap-4 lg:grid-cols-[2.2fr_1.4fr_1.2fr]">
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-12 w-full rounded bg-slate-200" />
        <div className="h-12 w-full rounded bg-slate-200" />
      </div>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-12 w-full rounded bg-slate-200" />
      </div>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-16 w-full rounded bg-slate-200" />
      </div>
    </div>
  </div>
)

const OrdersPage = ({ url }) => {
  const apiBase = url || ''
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [mapOrder, setMapOrder] = useState(null)
  const [invoiceOrder, setInvoiceOrder] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const normalizeOrders = (rawOrders) => {
    if (!Array.isArray(rawOrders)) return []
    const mapped = rawOrders.map((order) => ({
      ...order,
      items: Array.isArray(order?.items) ? order.items : [],
      customer: getCustomerInfo(order),
    }))
    return mapped.sort((a, b) => {
      const timeA = new Date(a?.createdAt || a?.date || 0).getTime()
      const timeB = new Date(b?.createdAt || b?.date || 0).getTime()
      return timeB - timeA
    })
  }

  const fetchAllOrders = async () => {
    setLoading(true)
    try {
      const response = await http.get(`${apiBase}/api/order/list`)
      if (response.data.success) {
        setOrders(normalizeOrders(response.data.data))
      } else {
        toast.error('Có lỗi xảy ra')
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  const updateOrderStatus = async (order, nextStatus) => {
    if (!order?._id) return
    try {
      const response = await http.patch(`${apiBase}/api/orders/${order._id}/status`, {
        status: nextStatus,
      })
      if (response.data.success) {
        await fetchAllOrders()
      } else {
        toast.error(response?.data?.message || 'Có lỗi xảy ra')
      }
    } catch (error) {
      const message = error?.response?.data?.message || 'Có lỗi xảy ra'
      const shouldForce =
        typeof message === 'string' && message.toLowerCase().includes('chưa thanh toán')

      if (shouldForce) {
        const confirmed = window.confirm(
          'Đơn hàng chưa thanh toán. Bạn có muốn cập nhật trạng thái cưỡng bức không?'
        )
        if (confirmed) {
          try {
            const forceResponse = await http.patch(
              `${apiBase}/api/orders/${order._id}/status`,
              {
                status: nextStatus,
                force: true,
              }
            )
            if (forceResponse.data.success) {
              await fetchAllOrders()
              return
            }
            toast.error(forceResponse?.data?.message || message)
            return
          } catch (forceError) {
            toast.error(forceError?.response?.data?.message || message)
            return
          }
        }
      }

      toast.error(message)
    }
  }

  const deleteOrder = async (order) => {
    if (!order?._id) return
    const confirmed = window.confirm(`Xóa đơn hàng ${order?._id}?`)
    if (!confirmed) return

    try {
      const response = await http.delete(`${apiBase}/api/orders/${order._id}`)
      if (response.data.success) {
        toast.success('Đã xóa đơn hàng')
        await fetchAllOrders()
      } else {
        toast.error(response?.data?.message || 'Có lỗi xảy ra')
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Có lỗi xảy ra')
    }
  }

  const handleViewDetail = (order) => {
    setSelectedOrder(order)
  }

  const handleOrderUpdated = (updatedOrder) => {
    if (!updatedOrder?._id) return
    setOrders((prev) =>
      prev.map((order) =>
        String(order._id) === String(updatedOrder._id)
          ? { ...order, ...updatedOrder, customer: getCustomerInfo(updatedOrder) }
          : order
      )
    )
    setSelectedOrder((prev) =>
      prev && String(prev._id) === String(updatedOrder._id) ? { ...prev, ...updatedOrder } : prev
    )
  }

  useEffect(() => {
    if (!apiBase) return
    fetchAllOrders()
  }, [apiBase])

  const filteredOrders = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    return orders.filter((order) => {
      const normalized = normalizeStatus(order?.status)
      const matchStatus = statusFilter === 'all' || normalized === statusFilter
      if (!matchStatus) return false
      if (fromDate || toDate) {
        const raw = order?.createdAt || order?.date || ''
        const orderDate = raw ? new Date(raw) : null
        if (!orderDate || Number.isNaN(orderDate.getTime())) return false

        if (fromDate) {
          const from = new Date(`${fromDate}T00:00:00`)
          if (Number.isNaN(from.getTime()) || orderDate < from) return false
        }

        if (toDate) {
          const to = new Date(`${toDate}T23:59:59.999`)
          if (Number.isNaN(to.getTime()) || orderDate > to) return false
        }
      }
      if (!keyword) return true

      const idText = String(order?._id || '').toLowerCase()
      const nameText = String(order?.customer?.name || '').toLowerCase()
      const itemText = Array.isArray(order?.items)
        ? order.items.map((item) => item?.name || '').join(' ').toLowerCase()
        : ''

      return idText.includes(keyword) || nameText.includes(keyword) || itemText.includes(keyword)
    })
  }, [orders, searchTerm, statusFilter, fromDate, toDate])

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <h3 className="text-xl font-semibold text-slate-800">Quản lý đơn hàng</h3>
          <div className="flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo mã đơn, tên khách, sản phẩm..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 sm:flex-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((status) => {
              const active = statusFilter === status
              const label = status === 'all' ? 'Tất cả' : STATUS_META[status]?.label || status
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`btn ${active ? "btn-view" : "btn-cancel"}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <input
              aria-label="Tu ngay"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 sm:w-40"
            />
            <input
              aria-label="Den ngay"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 sm:w-40"
            />
          </div>
        </div>

        <div className="space-y-4">
          {loading && Array.from({ length: 3 }).map((_, index) => <OrderSkeletonCard key={index} index={index} />)}

          {!loading && filteredOrders.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              Không tìm thấy đơn hàng phù hợp
            </div>
          )}

          {!loading &&
            filteredOrders.map((order) => (
              <OrderCard
                key={order._id || order.orderId}
                order={order}
                apiBase={apiBase}
                onUpdateStatus={updateOrderStatus}
                onOpenInvoice={setInvoiceOrder}
                onOpenMap={setMapOrder}
                onViewDetail={handleViewDetail}
                onDeleteOrder={deleteOrder}
              />
            ))}
        </div>
      </div>

      <MapModal
        isOpen={Boolean(mapOrder)}
        storeLat={mapOrder?.storeLocation?.lat}
        storeLng={mapOrder?.storeLocation?.lng}
        customerLat={mapOrder?.deliveryAddress?.lat}
        customerLng={mapOrder?.deliveryAddress?.lng}
        distanceKm={mapOrder?.distance ?? mapOrder?.distanceKm}
        deliveryTime={mapOrder?.deliveryTime ?? mapOrder?.durationMinutes ?? mapOrder?.duration}
        items={mapOrder?.items}
        onClose={() => setMapOrder(null)}
      />
      <InvoiceModal order={invoiceOrder} isOpen={Boolean(invoiceOrder)} onClose={() => setInvoiceOrder(null)} />
      <OrderDetailModal
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        apiBase={apiBase}
        onOrderUpdated={handleOrderUpdated}
      />
    </div>
  )
}

export default OrdersPage






