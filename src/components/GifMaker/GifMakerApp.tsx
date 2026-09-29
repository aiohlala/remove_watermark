import { useCallback, useEffect, useRef, useState } from 'react'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import omggif from 'omggif'

export interface ImageFrame {
  id: string
  img: HTMLImageElement
  name: string
  width: number
  height: number
}

const DEMO_FRAMES = [
  {
    title: '笑臉眨眼示範',
    generate: () => {
      const frames: ImageFrame[] = []
      const w = 240
      const h = 240
      const states = [
        { eye: 12, mouth: 1.0, color: '#f59e0b' },
        { eye: 6, mouth: 0.8, color: '#f59e0b' },
        { eye: 1, mouth: 0.5, color: '#f59e0b' },
        { eye: 6, mouth: 0.8, color: '#f59e0b' },
      ]
      states.forEach((st, idx) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, w, h)

        // Face
        ctx.beginPath()
        ctx.arc(120, 120, 80, 0, Math.PI * 2)
        ctx.fillStyle = st.color
        ctx.fill()

        // Left eye
        ctx.beginPath()
        ctx.ellipse(90, 105, 8, st.eye, 0, 0, Math.PI * 2)
        ctx.fillStyle = '#0f172a'
        ctx.fill()

        // Right eye
        ctx.beginPath()
        ctx.ellipse(150, 105, 8, st.eye, 0, 0, Math.PI * 2)
        ctx.fill()

        // Smile mouth
        ctx.beginPath()
        ctx.arc(120, 130, 40 * st.mouth, 0.2 * Math.PI, 0.8 * Math.PI)
        ctx.lineWidth = 8
        ctx.strokeStyle = '#0f172a'
        ctx.lineCap = 'round'
        ctx.stroke()

        const img = new Image()
        img.src = c.toDataURL('image/png')
        frames.push({
          id: `demo_${idx}`,
          img,
          name: `示範眨眼_${idx + 1}.png`,
          width: w,
          height: h,
        })
      })
      return frames
    },
  },
]

export default function GifMakerApp() {
  const [frames, setFrames] = useState<ImageFrame[]>([])
  const [fps, setFps] = useState(8) // 1 ~ 30 fps
  const [loopMode, setLoopMode] = useState<'loop' | 'pingpong'>('loop')
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  // 計算有效序列 (若是 pingpong: 1, 2, 3, 2)
  const sequenceIndices = useRef<number[]>([])
  useEffect(() => {
    if (frames.length === 0) {
      sequenceIndices.current = []
      return
    }
    if (loopMode === 'loop' || frames.length <= 2) {
      sequenceIndices.current = frames.map((_, i) => i)
    } else {
      const forward = frames.map((_, i) => i)
      const backward = frames.slice(1, -1).reverse().map((_, i) => frames.length - 2 - i)
      sequenceIndices.current = [...forward, ...backward]
    }
  }, [frames, loopMode])

  // 1. 批次解析上傳圖片
  const handleFiles = async (files: FileList | File[]) => {
    const newFrames: ImageFrame[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const arrayBuffer = await file.arrayBuffer()

      // 若為 GIF 則拆解影格
      if (file.type === 'image/gif') {
        try {
          const bytes = new Uint8Array(arrayBuffer)
          const reader = new omggif.GifReader(bytes)
          const num = reader.numFrames()
          const w = reader.width
          const h = reader.height
          const pixelBuf = new Uint8ClampedArray(w * h * 4)

          for (let f = 0; f < num; f++) {
            reader.decodeAndBlitFrameRGBA(f, pixelBuf)
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixelBuf), w, h), 0, 0)
            const img = new Image()
            img.src = c.toDataURL('image/png')
            await new Promise((r) => { img.onload = r })
            newFrames.push({
              id: `${Date.now()}_${i}_${f}_${Math.random()}`,
              img,
              name: `${file.name.replace(/\.[^.]+$/, '')}_幀${f + 1}`,
              width: w,
              height: h,
            })
          }
          continue
        } catch (e) {
          console.warn('GIF 解碼失敗，改以普通圖片載入', e)
        }
      }

      // 常規靜態圖片
      const blob = new Blob([arrayBuffer], { type: file.type })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          resolve()
        }
        img.onerror = () => reject(new Error('圖片載入失敗'))
        img.src = url
      })
      newFrames.push({
        id: `${Date.now()}_${i}_${Math.random()}`,
        img,
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    }

    if (newFrames.length > 0) {
      setFrames((prev) => [...prev, ...newFrames])
      setCurrentFrameIdx(0)
    }
  }

  // 2. 畫布即時渲染
  const renderFrameToCanvas = useCallback((frameIdx: number) => {
    const canvas = canvasRef.current
    if (!canvas || frames.length === 0) return
    const frame = frames[frameIdx]
    if (!frame) return

    // 基準解析度：以第一幀解析度為畫布大小
    const targetW = frames[0].width || 400
    const targetH = frames[0].height || 400

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, targetW, targetH)

    if (fitMode === 'contain') {
      const scale = Math.min(targetW / frame.width, targetH / frame.height)
      const dw = frame.width * scale
      const dh = frame.height * scale
      const dx = (targetW - dw) / 2
      const dy = (targetH - dh) / 2
      ctx.drawImage(frame.img, dx, dy, dw, dh)
    } else {
      ctx.drawImage(frame.img, 0, 0, targetW, targetH)
    }
  }, [frames, fitMode])

  // 3. 動畫播放器計時迴圈
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return

    let canceled = false
    let currentSeqPos = 0

    const delayMs = Math.round(1000 / fps)

    const tick = () => {
      if (canceled || !isPlayingRef.current) return
      const seq = sequenceIndices.current
      if (seq.length > 0) {
        currentSeqPos = (currentSeqPos + 1) % seq.length
        const realIdx = seq[currentSeqPos]
        setCurrentFrameIdx(realIdx)
        renderFrameToCanvas(realIdx)
      }
      timerRef.current = setTimeout(tick, delayMs)
    }

    renderFrameToCanvas(currentFrameIdx)
    timerRef.current = setTimeout(tick, delayMs)

    return () => {
      canceled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isPlaying, frames, fps, renderFrameToCanvas])

  // 4. 幀操作（排序、刪除）
  const moveFrame = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index === 0) return
    if (direction === 'right' && index === frames.length - 1) return
    const targetIdx = direction === 'left' ? index - 1 : index + 1
    const copy = [...frames]
    const temp = copy[index]
    copy[index] = copy[targetIdx]
    copy[targetIdx] = temp
    setFrames(copy)
  }

  const deleteFrame = (index: number) => {
    setFrames((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUseDemo = () => {
    const demo = DEMO_FRAMES[0].generate()
    setFrames(demo)
    setCurrentFrameIdx(0)
  }

  // 5. 匯出動態 GIF
  const handleExportGif = async () => {
    if (frames.length === 0) return
    setIsExporting(true)
    setExportProgress(0)

    try {
      const targetW = frames[0].width || 400
      const targetH = frames[0].height || 400
      const encoder = GIFEncoder()
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = targetW
      tempCanvas.height = targetH
      const ctx = tempCanvas.getContext('2d')!

      const delayMs = Math.round(1000 / fps)
      const seq = sequenceIndices.current.length > 0 ? sequenceIndices.current : frames.map((_, i) => i)

      for (let s = 0; s < seq.length; s++) {
        const frameIdx = seq[s]
        const frame = frames[frameIdx]
        ctx.clearRect(0, 0, targetW, targetH)

        if (fitMode === 'contain') {
          const scale = Math.min(targetW / frame.width, targetH / frame.height)
          const dw = frame.width * scale
          const dh = frame.height * scale
          const dx = (targetW - dw) / 2
          const dy = (targetH - dh) / 2
          ctx.drawImage(frame.img, dx, dy, dw, dh)
        } else {
          ctx.drawImage(frame.img, 0, 0, targetW, targetH)
        }

        const imgData = ctx.getImageData(0, 0, targetW, targetH).data
        const palette = quantize(imgData, 256)
        const index = applyPalette(imgData, palette)
        encoder.writeFrame(index, targetW, targetH, { palette, delay: delayMs })

        setExportProgress(Math.round(((s + 1) / seq.length) * 100))
        // 讓出事件循環給 UI 更新進度條
        await new Promise((r) => setTimeout(r, 8))
      }

      encoder.finish()
      const bytes = encoder.bytes()
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `animated_${Date.now()}.gif`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('GIF 匯出失敗，請再試一次。')
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  return (
    <div className="gifmaker-container">
      {frames.length === 0 ? (
        <div className="gifmaker-empty-dropzone">
          <div
            className="gifmaker-drop-box"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files)
            }}
          >
            <div className="drop-icon">🎞️</div>
            <h3>拖曳多張圖片到這裡，或點擊批次選擇</h3>
            <p className="drop-sub">支援 PNG、JPG、WebP 或既有 GIF 影格分解，自動依序結合成動態 GIF</p>
            <div className="demo-actions">
              <button
                type="button"
                className="btn-demo-preset"
                onClick={(e) => {
                  e.stopPropagation()
                  handleUseDemo()
                }}
              >
                ✨ 載入「眨眼表情包」示範影格
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFiles(e.target.files)
                e.target.value = ''
              }
            }}
          />
        </div>
      ) : (
        <div className="gifmaker-workspace">
          {/* 上半部：即時預覽與播放控制列 */}
          <div className="gifmaker-preview-section">
            <div className="gifmaker-canvas-wrap">
              <canvas ref={canvasRef} className="gifmaker-preview-canvas" />
            </div>

            <div className="gifmaker-playback-controls">
              <button
                type="button"
                className="btn-play-pause"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ 暫停播放' : '▶ 開始播放'}
              </button>

              <div className="control-slider-group">
                <span className="slider-label">播放速率:</span>
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                />
                <span className="slider-val">{fps} FPS ({Math.round(1000 / fps)}ms)</span>
              </div>

              <div className="mode-toggle-group">
                <button
                  type="button"
                  className={`btn-mode-pill${loopMode === 'loop' ? ' active' : ''}`}
                  onClick={() => setLoopMode('loop')}
                >
                  🔄 順序循環
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill${loopMode === 'pingpong' ? ' active' : ''}`}
                  onClick={() => setLoopMode('pingpong')}
                >
                  🪀 來回溜溜球
                </button>
              </div>

              <div className="fit-toggle-group">
                <button
                  type="button"
                  className={`btn-mode-pill${fitMode === 'contain' ? ' active' : ''}`}
                  onClick={() => setFitMode('contain')}
                  title="等比完整顯示"
                >
                  完整適配
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill${fitMode === 'cover' ? ' active' : ''}`}
                  onClick={() => setFitMode('cover')}
                  title="拉伸填滿畫布"
                >
                  填滿
                </button>
              </div>
            </div>
          </div>

          {/* 下半部：影格時間軸與操作 */}
          <div className="gifmaker-timeline-section">
            <div className="timeline-header">
              <div className="timeline-title-row">
                <h4>影格序列 ({frames.length} 幀)</h4>
                <span className="timeline-hint">點擊左右箭頭可自由調換影格順序</span>
              </div>
              <div className="timeline-actions">
                <button
                  type="button"
                  className="btn-add-more"
                  onClick={() => fileInputRef.current?.click()}
                >
                  ➕ 新增更多圖片
                </button>
                <button
                  type="button"
                  className="btn-clear-all"
                  onClick={() => setFrames([])}
                >
                  ✕ 全部清空
                </button>
              </div>
            </div>

            <div className="timeline-frames-track">
              {frames.map((f, idx) => (
                <div
                  key={f.id}
                  className={`timeline-frame-card${currentFrameIdx === idx ? ' current' : ''}`}
                  onClick={() => {
                    setIsPlaying(false)
                    setCurrentFrameIdx(idx)
                    renderFrameToCanvas(idx)
                  }}
                >
                  <div className="frame-badge">#{idx + 1}</div>
                  <img src={f.img.src} alt={f.name} className="frame-thumb" />
                  <div className="frame-actions">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveFrame(idx, 'left')
                      }}
                      title="往前移"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="btn-del-frame"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteFrame(idx)
                      }}
                      title="刪除此幀"
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      disabled={idx === frames.length - 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveFrame(idx, 'right')
                      }}
                      title="往後移"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleFiles(e.target.files)
                  e.target.value = ''
                }
              }}
            />

            {/* 底部匯出列 */}
            <div className="gifmaker-export-bar">
              <button
                type="button"
                className="btn-export-gif"
                disabled={isExporting}
                onClick={handleExportGif}
              >
                {isExporting ? `正在編碼 GIF (${exportProgress}%)...` : '💾 匯出並下載動態 GIF'}
              </button>
              <span className="privacy-pill">🔒 100% 瀏覽器本機記憶體合成 • 不經過任何伺服器</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
