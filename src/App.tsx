import { useState } from 'react'
import WatermarkApp from './components/WatermarkApp'
import SkinToneApp from './components/SkinTone/SkinToneApp'
import GifMakerApp from './components/GifMaker/GifMakerApp'

type Tab = 'watermark' | 'skintone' | 'gifmaker'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('watermark')

  return (
    <div className="app">
      <header className="app-header">
        {/* 頂部導覽切換列 */}
        <nav className="feature-nav" role="tablist" aria-label="功能選擇">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'watermark'}
            className={`nav-tab-btn${activeTab === 'watermark' ? ' active' : ''}`}
            onClick={() => setActiveTab('watermark')}
          >
            <span className="tab-icon">🧽</span>
            <span>浮水印去除</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'skintone'}
            className={`nav-tab-btn${activeTab === 'skintone' ? ' active' : ''}`}
            onClick={() => setActiveTab('skintone')}
          >
            <span className="tab-icon">🎨</span>
            <span>人像膚色調和</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'gifmaker'}
            className={`nav-tab-btn${activeTab === 'gifmaker' ? ' active' : ''}`}
            onClick={() => setActiveTab('gifmaker')}
          >
            <span className="tab-icon">🎞️</span>
            <span>GIF 動態圖製作</span>
          </button>
        </nav>

        <h1>
          {activeTab === 'watermark'
            ? '浮水印去除工具'
            : activeTab === 'skintone'
              ? '人像膚色勻稱工具'
              : 'GIF 動態圖製作工坊'}
        </h1>
        <p className="subtitle">
          {activeTab === 'watermark'
            ? '純前端處理，圖片不會上傳到任何伺服器'
            : activeTab === 'skintone'
              ? '純前端 OKLab 感官色彩調和，臉部與身體膚色自然一致'
              : '上傳多張圖片自訂順序與速率，純前端秒級合成動態 GIF'}
        </p>
      </header>

      <main className="app-main">
        {/* 保持三者 DOM 狀態獨立且互不干擾 */}
        <div
          role="tabpanel"
          style={{ display: activeTab === 'watermark' ? 'block' : 'none' }}
        >
          <WatermarkApp />
        </div>

        <div
          role="tabpanel"
          style={{ display: activeTab === 'skintone' ? 'block' : 'none' }}
        >
          <SkinToneApp />
        </div>

        <div
          role="tabpanel"
          style={{ display: activeTab === 'gifmaker' ? 'block' : 'none' }}
        >
          <GifMakerApp />
        </div>
      </main>

      <footer className="app-footer">
        <p>
          {activeTab === 'watermark'
            ? '使用 OpenCV Telea inpainting 演算法，所有運算皆在瀏覽器本機完成。'
            : activeTab === 'skintone'
              ? '使用 OKLab 感官色彩空間與邊緣高斯羽化，純前端運算，隱私無憂。'
              : '純瀏覽器記憶體合成與調色盤編碼，零上傳伺服器，隱私無憂。'}
        </p>
      </footer>
    </div>
  )
}
