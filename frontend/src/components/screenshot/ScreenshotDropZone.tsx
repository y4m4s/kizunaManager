import { useRef, useState } from 'react'
import { imageFilesFrom } from '../../lib/screenshotImport/files'
import type { ShotState } from './useScreenshotQueue'

type ScreenshotDropZoneProps = {
  shots: Array<ShotState<unknown>>
  tips: string[]
  onFiles: (files: File[]) => void
}

// 画像を入れる前は中央に説明を、入れた後はサムネイルと追加ボタンを並べる
export function ScreenshotDropZone({ shots, tips, onFiles }: ScreenshotDropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`screenshot-drop${shots.length ? '' : ' is-empty'}${dragging ? ' is-dragging' : ''}`}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        onFiles(imageFilesFrom(event.dataTransfer.files))
      }}
    >
      {shots.length ? (
        <>
          {shots.map((shot) => (
            <figure key={shot.id} className={`screenshot-shot is-${shot.status}`} title={shot.name}>
              <img alt={shot.name} src={shot.previewUrl} />
              <figcaption>
                {shot.status === 'waiting'
                  ? '待機中'
                  : shot.status === 'reading'
                    ? shot.message || '読み取り中…'
                    : shot.message}
              </figcaption>
            </figure>
          ))}
          <button className="screenshot-add" type="button" onClick={() => fileInputRef.current?.click()}>
            <strong>＋ 画像を追加</strong>
            <span>ドロップ / <kbd>Ctrl</kbd>+<kbd>V</kbd> でも追加できます</span>
          </button>
        </>
      ) : (
        <div className="screenshot-empty">
          <svg aria-hidden="true" className="screenshot-empty-icon" fill="none" viewBox="0 0 48 48">
            <rect height="30" rx="5" stroke="currentColor" strokeWidth="2.5" width="40" x="4" y="9" />
            <path d="M4 32l11-10 9 8 6-5 14 11" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.5" />
            <circle cx="33" cy="18" fill="currentColor" r="3" />
          </svg>
          <strong>スクショをここにドロップ</strong>
          <p>
            <kbd>Ctrl</kbd>+<kbd>V</kbd> で貼り付けることもできます。複数枚まとめて入れられます。
          </p>
          <button className="btn btn-primary" type="button" onClick={() => fileInputRef.current?.click()}>
            画像を選択
          </button>
          {tips.length ? (
            <ul className="screenshot-empty-tips">
              {tips.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          ) : null}
        </div>
      )}
      <input
        ref={fileInputRef}
        accept="image/*"
        hidden
        multiple
        type="file"
        onChange={(event) => {
          onFiles(imageFilesFrom(event.target.files))
          event.target.value = ''
        }}
      />
    </div>
  )
}
