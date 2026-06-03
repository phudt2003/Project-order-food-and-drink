import React, { useContext } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@clerk/react'
import Navbar from './components/Navbar/Navbar'
import Home from './pages/Home/Home'
import Cart from './pages/Cart/Cart'
import CheckoutPage from './pages/CheckoutPage/CheckoutPage'
import Footer from './components/Footer/Footer'
import MyOrders from './pages/MyOrders/MyOrders'
import MyVouchers from './pages/MyVouchers/MyVouchers'
import Loyalty from './pages/Loyalty/Loyalty'
import ProductDetail from './pages/ProductDetail/ProductDetail'
import Payment from './pages/Payment/Payment'
import PaymentSuccess from './pages/Payment/PaymentSuccess'
import Search from './pages/Search/Search'
import PosOrder from './pages/PosOrder/PosOrder'
import { StoreContext, UIContext } from './context/StoreContext'
import LoginModal from './components/LoginModal/LoginModal'
import BirthdayModal from './components/Birthday/BirthdayModal'
import CheckinCalendarModal from './components/Loyalty/CheckinCalendarModal'
import VoucherUseNotice from './components/common/VoucherUseNotice'
import RequireCheckoutNotEmpty from './components/routing/RequireCheckoutNotEmpty'
import { DEFAULT_TIMEZONE, isCheckedInToday as isCheckedInTodayInTz } from './utils/date'

const HOME_PATHS = new Set(['/', '/menu', '/mobile-app', '/contact', '/explore-menu', '/food-display'])

const RequireAuth = ({ children }) => {
  const { isSignedIn, isLoaded } = useUser()

  if (!isLoaded) return null
  if (!isSignedIn) return <Navigate to='/login' replace />
  return children
}

const App = () => {
  const location = useLocation()
  const { isLoaded, isSignedIn } = useUser()
  const { showLogin, setShowLogin } = useContext(UIContext)
  const { token, userProfile, updateBirthday, fetchCheckinStatus, fetchCheckinCalendar, loyaltyCheckin } = useContext(StoreContext)

  const timeZone = String(import.meta?.env?.VITE_LOYALTY_TZ || DEFAULT_TIMEZONE)
  const normalizedPath = String(location.pathname || '').replace(/\/+$/, '') || '/'
  const isAuthPage = normalizedPath === '/login'
    || normalizedPath.startsWith('/login/')
    || normalizedPath === '/sign-up'
    || normalizedPath.startsWith('/sign-up/')
  const isHome = HOME_PATHS.has(String(location.pathname || ''))
  const ready = Boolean(isLoaded && isSignedIn && token && userProfile && isHome)
  console.log("App rendered", { isLoaded, isSignedIn, path: location.pathname })

  // Global scroll restoration on route change (avoid staying at footer when navigating).
  useEffect(() => {
    const hash = String(location.hash || '').replace('#', '')
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else window.scrollTo({ top: 0, behavior: 'smooth' })
      })
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname, location.hash])

  const [showBirthdayModal, setShowBirthdayModal] = useState(false)
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [birthdayDismissed, setBirthdayDismissed] = useState(false)
  const [checkinDismissed, setCheckinDismissed] = useState(false)

  const [checkinBusy, setCheckinBusy] = useState(false)
  const [checkinRewardCoins, setCheckinRewardCoins] = useState(0)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarData, setCalendarData] = useState(null)

  const reqRef = useRef(0)
  const sessionKeyRef = useRef('')
  const gateDoneRef = useRef(false)

  const isCheckedInToday = useCallback((date) => isCheckedInTodayInTz(date, timeZone), [timeZone])

  const userSessionKey = useMemo(() => {
    const uid = String(userProfile?._id || userProfile?.id || '')
    const t = String(token || '')
    if (!uid || !t) return ''
    return `${uid}:${t}`
  }, [token, userProfile?._id, userProfile?.id])

  useEffect(() => {
    if (!userSessionKey) {
      sessionKeyRef.current = ''
      gateDoneRef.current = false
      return
    }
    if (userSessionKey !== sessionKeyRef.current) {
      sessionKeyRef.current = userSessionKey
      gateDoneRef.current = false
      setBirthdayDismissed(false)
      setCheckinDismissed(false)
    }
  }, [userSessionKey])

  const syncCheckinStatus = useCallback(async ({ fallbackShouldOpen }) => {
    const reqId = (reqRef.current += 1)
    if (!fetchCheckinStatus) {
      setShowCheckinModal(Boolean(fallbackShouldOpen))
      return
    }

    const res = await fetchCheckinStatus()
    if (reqId !== reqRef.current) return

    if (!res?.success) {
      setShowCheckinModal(Boolean(fallbackShouldOpen))
      return
    }

    const checkedToday = Boolean(res?.data?.checkedToday)
    const reward = Math.max(0, Number(res?.data?.rewardCoins || 0))
    if (reward > 0) setCheckinRewardCoins(reward)
    setShowCheckinModal(!checkedToday)
  }, [fetchCheckinStatus])

  const loadCalendar = useCallback(async () => {
    if (!fetchCheckinCalendar) return { success: false }

    setCalendarLoading(true)
    try {
      const res = await fetchCheckinCalendar()
      if (res?.success) setCalendarData(res.data)
      return res
    } finally {
      setCalendarLoading(false)
    }
  }, [fetchCheckinCalendar])

  useEffect(() => {
    reqRef.current += 1

    if (showLogin || !ready) {
      setShowBirthdayModal(false)
      setShowCheckinModal(false)
      setCheckinBusy(false)
      return
    }

    // Avoid reopening the check-in flow when users navigate (e.g. click logo).
    // This runs once per session; a full reload will reset state.
    if (gateDoneRef.current) return
    gateDoneRef.current = true

    if (!userProfile?.birthday) {
      setShowBirthdayModal(!birthdayDismissed)
      if (checkinDismissed) {
        setShowCheckinModal(false)
        return
      }

      const fallbackShouldOpen = !isCheckedInToday(userProfile?.lastCheckInDate)
      syncCheckinStatus({ fallbackShouldOpen })
      return
    }

    setShowBirthdayModal(false)
    if (checkinDismissed) {
      setShowCheckinModal(false)
      return
    }

    const fallbackShouldOpen = !isCheckedInToday(userProfile?.lastCheckInDate)
    syncCheckinStatus({ fallbackShouldOpen })
  }, [
    birthdayDismissed,
    checkinDismissed,
    isCheckedInToday,
    ready,
    showLogin,
    syncCheckinStatus,
    userProfile?.birthday,
    userProfile?.lastCheckInDate,
  ])

  useEffect(() => {
    if (isAuthPage && showLogin) {
      setShowLogin(false)
    }
  }, [isAuthPage, setShowLogin, showLogin])

  useEffect(() => {
    if (!ready) return
    if (!showCheckinModal) return
    if (showBirthdayModal) return
    loadCalendar()
  }, [loadCalendar, ready, showBirthdayModal, showCheckinModal])

  const handleDismissBirthday = () => {
    setShowBirthdayModal(false)
    setBirthdayDismissed(true)

    if (!ready) return
    if (checkinDismissed) return

    const fallbackShouldOpen = !isCheckedInToday(userProfile?.lastCheckInDate)
    syncCheckinStatus({ fallbackShouldOpen })
  }

  const handleUpdateBirthday = async (birthdayYmd) => {
    const res = await updateBirthday?.(birthdayYmd)
    if (res?.success) {
      setShowBirthdayModal(false)
      setCheckinDismissed(false)

      const updatedLastCheckIn = res?.user?.lastCheckInDate ?? userProfile?.lastCheckInDate
      const fallbackShouldOpen = !isCheckedInToday(updatedLastCheckIn)
      syncCheckinStatus({ fallbackShouldOpen })
    }
    return res
  }

  const handleCheckin = async () => {
    setCheckinBusy(true)
    try {
      const res = await loyaltyCheckin?.()
      if (res?.success) {
        setShowCheckinModal(false)
        setCheckinDismissed(true)
        await Promise.allSettled([syncCheckinStatus({ fallbackShouldOpen: false }), loadCalendar()])
        return res
      }

      const message = String(res?.message || '')
      if (message.toLowerCase().includes('already')) {
        setShowCheckinModal(false)
        setCheckinDismissed(true)
        await Promise.allSettled([syncCheckinStatus({ fallbackShouldOpen: false }), loadCalendar()])
      }
      return res
    } finally {
      setCheckinBusy(false)
    }
  }

  if (isAuthPage) {
    return (
      <div className='bg-[var(--bg-body)] text-[var(--text-primary)] transition-colors duration-300'>
        <Routes>
          <Route path='/login/*' element={<LoginModal mode='page' />} />
          <Route path='/sign-up/*' element={<LoginModal mode='sign-up-page' />} />
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
      </div>
    )
  }

  return (
    <div className='bg-[var(--bg-body)] text-[var(--text-primary)] transition-colors duration-300'>
      {/* Đảm bảo chỉ có 1 modal được mở tại một thời điểm */}
      {showLogin && !isAuthPage && <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />}
      {!showLogin && showBirthdayModal && (
        <BirthdayModal
          open={showBirthdayModal}
          birthday={userProfile?.birthday}
          onClose={handleDismissBirthday}
          onUpdated={() => setShowBirthdayModal(false)}
          onUpdateBirthday={handleUpdateBirthday}
        />
      )}
      {!showLogin && !showBirthdayModal && (
        <CheckinCalendarModal
          open={showCheckinModal}
          onClose={() => {
            setShowCheckinModal(false)
            setCheckinDismissed(true)
          }}
          data={calendarData}
          loading={calendarLoading}
          onCheckinToday={handleCheckin}
          todayReward={checkinRewardCoins}
          busy={checkinBusy}
        />
      )}

      <div className='app pb-20 transition-colors duration-300 md:pb-0'>
        <Navbar />
        <VoucherUseNotice />

        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/menu' element={<Home />} />
          <Route path='/food-display' element={<Home />} />
          <Route path='/mobile-app' element={<Home />} />
          <Route path='/contact' element={<Home />} />
          <Route path='/explore-menu' element={<Home />} />
          <Route
            path='/cart'
            element={(
              <RequireAuth>
                <Cart />
              </RequireAuth>
            )}
          />
          <Route
            path='/order'
            element={(
              <RequireAuth>
                <RequireCheckoutNotEmpty>
                  <CheckoutPage />
                </RequireCheckoutNotEmpty>
              </RequireAuth>
            )}
          />
          <Route
            path='/checkout'
            element={(
              <RequireAuth>
                <RequireCheckoutNotEmpty>
                  <CheckoutPage />
                </RequireCheckoutNotEmpty>
              </RequireAuth>
            )}
          />
          <Route path='/login/*' element={<LoginModal mode='page' />} />
          <Route path='/sign-up/*' element={<LoginModal mode='sign-up-page' />} />
          <Route
            path='/payment/success'
            element={(
              <RequireAuth>
                <PaymentSuccess />
              </RequireAuth>
            )}
          />
          <Route
            path='/payment/:orderId'
            element={(
              <RequireAuth>
                <Payment />
              </RequireAuth>
            )}
          />
          <Route path='/myorders' element={<MyOrders />} />
          <Route
            path='/pos'
            element={(
              <RequireAuth>
                <PosOrder />
              </RequireAuth>
            )}
          />
          <Route
            path='/myvouchers'
            element={(
              <RequireAuth>
                <MyVouchers />
              </RequireAuth>
            )}
          />
          <Route
            path='/loyalty'
            element={(
              <RequireAuth>
                <Loyalty />
              </RequireAuth>
            )}
          />
          <Route path='/product/:id' element={<ProductDetail />} />
          <Route path='/search' element={<Search />} />
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
      </div>

      <div className='hidden md:block'>
        <Footer />
      </div>
    </div>
  )
}

export default App
