import React from 'react'
import './AppDownload.css'
import { assets } from '../../assets/assets'

const AppDownload = () => {
  return (
    <div className='app-download' id='app-download'>
        <p>Để có trải nghiệm tốt hơn, hãy tải <br /> Coffee Bingo</p>
        <div className="app-download-platforms">
            <img src={assets.play_store} alt="Tải Coffee Bingo trên Google Play" width="216" height="69" />
            <img src={assets.app_store} alt="Tải Coffee Bingo trên App Store" width="192" height="63" />
        </div>
    </div>
  )
}

export default AppDownload
