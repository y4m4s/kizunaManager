const EXPORT_SCALE = 2
const RESULT_TABLE_SELECTOR = '.results-shell'

type ExportRect = {
  height: number
  width: number
  x: number
  y: number
}

type LoadedImageCache = Map<string, HTMLImageElement | null>

function timestampForFilename(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

function numberFromPx(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isVisibleColor(value: string): boolean {
  return Boolean(value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)')
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function elementRect(element: Element, rootRect: DOMRect): ExportRect {
  const rect = element.getBoundingClientRect()
  return {
    height: rect.height,
    width: rect.width,
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
  }
}

function radiusFor(style: CSSStyleDeclaration): number {
  return Math.max(
    numberFromPx(style.borderTopLeftRadius),
    numberFromPx(style.borderTopRightRadius),
    numberFromPx(style.borderBottomRightRadius),
    numberFromPx(style.borderBottomLeftRadius),
  )
}

function drawElementBackground(
  context: CanvasRenderingContext2D,
  rect: ExportRect,
  style: CSSStyleDeclaration,
) {
  const backgroundColor = style.backgroundColor
  if (!isVisibleColor(backgroundColor) || rect.width <= 0 || rect.height <= 0) {
    return
  }

  context.save()
  context.fillStyle = backgroundColor
  roundRect(context, rect.x, rect.y, rect.width, rect.height, radiusFor(style))
  context.fill()
  context.restore()
}

function drawBorderLine(
  context: CanvasRenderingContext2D,
  color: string,
  width: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  if (width <= 0 || !isVisibleColor(color)) {
    return
  }

  context.save()
  context.strokeStyle = color
  context.lineWidth = width
  context.beginPath()
  context.moveTo(fromX, fromY)
  context.lineTo(toX, toY)
  context.stroke()
  context.restore()
}

function drawElementBorders(
  context: CanvasRenderingContext2D,
  rect: ExportRect,
  style: CSSStyleDeclaration,
) {
  if (rect.width <= 0 || rect.height <= 0) {
    return
  }

  drawBorderLine(
    context,
    style.borderTopColor,
    numberFromPx(style.borderTopWidth),
    rect.x,
    rect.y,
    rect.x + rect.width,
    rect.y,
  )
  drawBorderLine(
    context,
    style.borderRightColor,
    numberFromPx(style.borderRightWidth),
    rect.x + rect.width,
    rect.y,
    rect.x + rect.width,
    rect.y + rect.height,
  )
  drawBorderLine(
    context,
    style.borderBottomColor,
    numberFromPx(style.borderBottomWidth),
    rect.x,
    rect.y + rect.height,
    rect.x + rect.width,
    rect.y + rect.height,
  )
  drawBorderLine(
    context,
    style.borderLeftColor,
    numberFromPx(style.borderLeftWidth),
    rect.x,
    rect.y,
    rect.x,
    rect.y + rect.height,
  )
}

function drawFallbackIcon(
  context: CanvasRenderingContext2D,
  label: string,
  rect: ExportRect,
) {
  const text = Array.from(label.trim()).slice(0, 2).join('') || '?'
  context.save()
  context.fillStyle = '#eef2ff'
  roundRect(context, rect.x, rect.y, rect.width, rect.height, 10)
  context.fill()
  context.fillStyle = '#475569'
  context.font = '700 12px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2)
  context.restore()
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: ExportRect,
) {
  const ratio = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
  const width = image.naturalWidth * ratio
  const height = image.naturalHeight * ratio
  context.drawImage(
    image,
    rect.x + (rect.width - width) / 2,
    rect.y + (rect.height - height) / 2,
    width,
    height,
  )
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'reload', mode: 'cors' })
    if (!response.ok) {
      return null
    }
    return await blobToDataUrl(await response.blob())
  } catch {
    return null
  }
}

function imageFromUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function imageSource(image: HTMLImageElement): string | null {
  const src = image.currentSrc || image.getAttribute('src')
  return src ? new URL(src, window.location.href).toString() : null
}

async function preloadImages(source: HTMLElement): Promise<LoadedImageCache> {
  const urls = Array.from(source.querySelectorAll<HTMLImageElement>('img'))
    .map(imageSource)
    .filter((url): url is string => Boolean(url))
  const uniqueUrls = Array.from(new Set(urls))
  const entries = await Promise.all(
    uniqueUrls.map(async (url) => {
      const safeUrl = url.startsWith('data:') ? url : await fetchAsDataUrl(url)
      return [url, safeUrl ? await imageFromUrl(safeUrl) : null] as const
    }),
  )
  return new Map(entries)
}

function drawImageElement(
  context: CanvasRenderingContext2D,
  imageElement: HTMLImageElement,
  rootRect: DOMRect,
  images: LoadedImageCache,
) {
  const rect = elementRect(imageElement, rootRect)
  if (rect.width <= 0 || rect.height <= 0) {
    return
  }

  const src = imageSource(imageElement)
  const image = src ? images.get(src) : null
  if (!image) {
    drawFallbackIcon(context, imageElement.alt, rect)
    return
  }

  const style = window.getComputedStyle(imageElement)
  context.save()
  roundRect(context, rect.x, rect.y, rect.width, rect.height, radiusFor(style))
  context.clip()
  drawContainedImage(context, image, rect)
  context.restore()
}

function canvasFontFrom(style: CSSStyleDeclaration): string {
  return [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].filter(Boolean).join(' ')
}

function drawTextNodes(context: CanvasRenderingContext2D, source: HTMLElement, rootRect: DOMRect) {
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node instanceof Text && node.textContent?.trim()) {
      textNodes.push(node)
    }
  }

  textNodes.forEach((textNode) => {
    const parent = textNode.parentElement
    if (!parent) {
      return
    }

    const style = window.getComputedStyle(parent)
    if (style.visibility === 'hidden' || style.display === 'none' || !isVisibleColor(style.color)) {
      return
    }

    range.selectNodeContents(textNode)
    const rect = range.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    context.save()
    context.fillStyle = style.color
    context.font = canvasFontFrom(style)
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillText(textNode.textContent.trim(), rect.left - rootRect.left, rect.top - rootRect.top + rect.height / 2)
    context.restore()
  })

  range.detach()
}

function exportSize(source: HTMLElement, rootRect: DOMRect): { height: number; width: number } {
  const childRects = Array.from(source.querySelectorAll<HTMLElement>('*')).map((element) =>
    element.getBoundingClientRect(),
  )
  const maxRight = Math.max(
    source.scrollWidth,
    rootRect.width,
    ...childRects.map((rect) => rect.right - rootRect.left),
  )
  const maxBottom = Math.max(
    source.scrollHeight,
    rootRect.height,
    ...childRects.map((rect) => rect.bottom - rootRect.top),
  )

  return {
    height: Math.ceil(maxBottom),
    width: Math.ceil(maxRight),
  }
}

async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob)
      } else {
        reject(new Error('PNG image could not be created.'))
      }
    }, 'image/png')
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function findResultTable(root: HTMLElement): HTMLElement | null {
  if (root.matches(RESULT_TABLE_SELECTOR)) {
    return root
  }
  return root.querySelector<HTMLElement>(RESULT_TABLE_SELECTOR)
}

export async function exportSearchResultsPng(root: HTMLElement): Promise<void> {
  const source = findResultTable(root)
  if (!source) {
    throw new Error('Search results table is not rendered.')
  }

  await document.fonts.ready

  const rootRect = source.getBoundingClientRect()
  const { height, width } = exportSize(source, rootRect)
  const canvas = document.createElement('canvas')
  canvas.width = width * EXPORT_SCALE
  canvas.height = height * EXPORT_SCALE

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is not available.')
  }

  context.scale(EXPORT_SCALE, EXPORT_SCALE)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  const elements = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))]
  elements.forEach((element) => {
    const style = window.getComputedStyle(element)
    drawElementBackground(context, elementRect(element, rootRect), style)
  })
  elements.forEach((element) => {
    const style = window.getComputedStyle(element)
    drawElementBorders(context, elementRect(element, rootRect), style)
  })

  const images = await preloadImages(source)
  Array.from(source.querySelectorAll<HTMLImageElement>('img')).forEach((imageElement) => {
    drawImageElement(context, imageElement, rootRect, images)
  })
  drawTextNodes(context, source, rootRect)

  await downloadCanvas(canvas, `kizuna-search-results-${timestampForFilename()}.png`)
}
