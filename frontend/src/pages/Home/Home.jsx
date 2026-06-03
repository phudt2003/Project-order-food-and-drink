import React, { useEffect, useState } from 'react'
import './Home.css'
import { useContext, useMemo } from 'react'
import Header from '../../components/Header/Header'
import ExploreMenu from '../../components/ExploreMenu/ExploreMenu'
import FoodDisplay from '../../components/FoodDisplay/FoodDisplay'
import AppDownload from '../../components/AppDownload/AppDownload'
import { useLocation, useNavigate } from 'react-router-dom'
import { StoreContext } from '../../context/StoreContext'
import BirthdayRewardModal from '../../components/Birthday/BirthdayRewardModal'
import BirthdayConfetti from '../../components/Birthday/BirthdayConfetti'
import VoucherCard from '../../components/common/VoucherCard'
import FlashSaleProductsSection from '../../components/Promo/FlashSaleProductsSection'
import { classifyVoucher, isFlashSaleVoucher } from '../../utils/voucher'

const Home = () => {

  const [category, setCategory] = useState("All")
  const location = useLocation()
  const navigate = useNavigate()
  const { token, userProfile, autoSyncVouchers, refreshMyVouchers, myVouchers, voucherActiveCount, food_list } = useContext(StoreContext)
  const [voucherSync, setVoucherSync] = useState(null)
  const [showBirthdayModal, setShowBirthdayModal] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [flashExcludeIds, setFlashExcludeIds] = useState([])
  console.log("Home rendered")

  useEffect(() => {
    if (!toastMessage) return undefined
    const timer = setTimeout(() => setToastMessage(""), 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  useEffect(() => {
    console.log("Home food_list =", food_list)
  }, [food_list])

  useEffect(() => {
    const sectionMap = {
      "/menu": "food-display",
      "/explore-menu": "explore-menu",
      "/food-display": "food-display",
      "/mobile-app": "app-download",
    }

    const hashTarget = location.hash ? String(location.hash).replace("#", "") : ""
    const targetSectionId = hashTarget || sectionMap[location.pathname]

    if (!targetSectionId) {
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    requestAnimationFrame(() => {
      const section = document.getElementById(targetSectionId)
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    })
  }, [location.pathname, location.hash])

  useEffect(() => {
    let alive = true

    if (!token) {
      setVoucherSync(null)
      setShowBirthdayModal(false)
      return () => { alive = false }
    }

    autoSyncVouchers()
      .then((data) => {
        if (!alive) return
        if (!data?.success) return

        // Comment: Lưu kết quả auto-sync để hiển thị banner (birthday/welcome/flash sale...)
        setVoucherSync(data?.data || null)

        // Comment: Đồng bộ lại danh sách voucher "của tôi" để Home/MyVouchers hiển thị nhất quán
        refreshMyVouchers()

        const grantedVoucher =
          data?.data?.birthday?.voucherGranted && data?.data?.birthday?.voucher
            ? data.data.birthday.voucher
            : data?.data?.welcome?.voucherGranted && data?.data?.welcome?.voucher
              ? data.data.welcome.voucher
              : data?.data?.comeback?.voucherGranted && data?.data?.comeback?.voucher
                ? data.data.comeback.voucher
                : data?.data?.personalized?.voucherGranted && data?.data?.personalized?.voucher
                  ? data.data.personalized.voucher
                  : null

        if (grantedVoucher) {
          const userKey = String(userProfile?._id || "")
          const code = String(grantedVoucher?.voucherCode || "").trim().toUpperCase()
          const today = new Date()
          const y = today.getFullYear()
          const m = String(today.getMonth() + 1).padStart(2, "0")
          const d = String(today.getDate()).padStart(2, "0")
          const seenKey = `voucher_granted_seen_${userKey}_${code}_${y}${m}${d}`
          if (userKey && code && !localStorage.getItem(seenKey)) {
            localStorage.setItem(seenKey, "1")
            setToastMessage(`Bạn vừa nhận voucher ${code}!`)
          }
        }

        const birthday = data?.data?.birthday || null
        const voucher = birthday?.voucher || null
        if (!birthday?.isBirthdayToday || !voucher) return

        const userKey = String(userProfile?._id || '')
        if (!userKey) return
        const today = new Date()
        const y = today.getFullYear()
        const m = String(today.getMonth() + 1).padStart(2, '0')
        const d = String(today.getDate()).padStart(2, '0')
        const seenKey = `birthday_modal_seen_${userKey}_${y}${m}${d}`
        if (localStorage.getItem(seenKey)) return
        localStorage.setItem(seenKey, '1')

        setShowBirthdayModal(true)
      })
      .catch(() => {})

    return () => { alive = false }
  }, [token, autoSyncVouchers, refreshMyVouchers, userProfile?._id])

  // =========================
  // Voucher hot (dùng chung logic cho Home + MyVouchers)
  // =========================
  const currentUserId = String(userProfile?._id || '')
  const voucherView = useMemo(() => {
    const list = Array.isArray(myVouchers) ? myVouchers : []
    return list.map((voucher) => {
      const { bucket, state } = classifyVoucher(voucher, currentUserId)
      return { voucher, bucket, state }
    })
  }, [myVouchers, currentUserId])

  const activeVouchers = useMemo(() => {
    // Comment: Chỉ lấy voucher đang dùng được (còn hiệu lực + chưa hết lượt).
    const items = voucherView.filter((item) => item.bucket === 'available')
    // Ưu tiên happy_hour/flash sale trước, sau đó sắp hết hạn trước.
    items.sort((a, b) => {
      const aFlash = isFlashSaleVoucher(a.voucher) ? 1 : 0
      const bFlash = isFlashSaleVoucher(b.voucher) ? 1 : 0
      if (aFlash !== bFlash) return bFlash - aFlash
      const aEnd = a.state?.endDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER
      const bEnd = b.state?.endDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER
      return aEnd - bEnd
    })
    return items
  }, [voucherView])

  return (
    <div>
        <BirthdayConfetti user={userProfile} durationMs={5000} />

        <BirthdayRewardModal
          isOpen={showBirthdayModal}
          voucher={voucherSync?.birthday?.voucher}
          onClose={() => setShowBirthdayModal(false)}
          onViewVoucher={() => navigate('/myvouchers')}
        />
        <Header />
        <ExploreMenu
          category={category}
          setCategory={setCategory}
        />

        {/* =========================
            Ưu đãi Voucher Hot (Home)
            ========================= */}
        <section className='mx-auto w-full max-w-6xl px-4 pt-4'>
          <div className='rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
              <div>
                <p className='text-sm font-semibold tracking-wide text-[var(--accent)]'>Ưu đãi Voucher Hot</p>
                <h3 className='mt-1 text-lg font-semibold'>Voucher đang có hiệu lực</h3>
                <p className='mt-1 text-sm opacity-80'>
                  {token ? `Bạn đang có ${voucherActiveCount} voucher có thể dùng ngay.` : 'Đăng nhập để xem voucher dành cho bạn.'}
                </p>
              </div>

              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => navigate('/myvouchers')}
                  className='rounded-xl border border-[var(--border-color)] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5'
                >
                  Xem tất cả
                </button>
                <button
                  type='button'
                  onClick={() => navigate('/cart')}
                  className='rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95'
                >
                  Đi giỏ hàng
                </button>
              </div>
            </div>

            {/* Flash Sale voucher (global) từ autoSyncVouchers */}
            {voucherSync?.flash_sale?.active && voucherSync?.flash_sale?.voucher ? (
              <div className='mt-4'>
                <VoucherCard
                  voucher={voucherSync.flash_sale.voucher}
                  currentUserId={currentUserId}
                  mode='featured'
                  showCountdown
                />
              </div>
            ) : null}

            {/* Danh sách voucher active của user */}
            {token ? (
              activeVouchers.length > 0 ? (
                <div className='mt-4 grid grid-cols-1 gap-4 md:grid-cols-2'>
                  {activeVouchers.slice(0, 6).map((item) => (
                    <VoucherCard
                      key={String(item?.voucher?._id || `${item?.voucher?.voucherCode || 'voucher'}-${item?.voucher?.createdAt || ''}`)}
                      voucher={item.voucher}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              ) : (
                <div className='mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-body)] p-4 text-sm opacity-80'>
                  Hiện chưa có voucher nào đang khả dụng. Hãy ghé lại sau hoặc xem mục Voucher để nhận ưu đãi mới.
                </div>
              )
            ) : (
              <div className='mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-body)] p-4 text-sm opacity-80'>
                Bạn cần đăng nhập để xem voucher cá nhân (welcome/birthday/comeback...).
              </div>
            )}
          </div>
        </section>

        {/* Flash sale sản phẩm (UI-only). Section tự ẩn khi API trả rỗng hoặc hết giờ. */}
        {/* FlashSaleSection ẩn tạm (API 404) */}
        {/* <FlashSaleSection /> */}

        <FlashSaleProductsSection
          category={category}
          flashVoucher={voucherSync?.flash_sale?.voucher}
          onActiveProductIdsChange={setFlashExcludeIds}
        />

        <FoodDisplay category={category} excludeIds={flashExcludeIds} />
        <AppDownload />

        {toastMessage ? (
          <div className='fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-black px-4 py-3 text-center text-sm text-white shadow-lg'>
            {toastMessage}
          </div>
        ) : null}
    </div>
  )
}

export default Home
