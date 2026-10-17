import { startTransition, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { InventoryEditor } from '../components/optimize/InventoryEditor'
import { ScreenshotImportModal } from '../components/optimize/ScreenshotImportModal'
import { imageFilesFrom } from '../lib/screenshotImport/files'
import { resolveQuantityInput } from '../lib/quantityInput'
import type { Item } from '../types'

type GiftManagementScreenProps = {
  bridgeReady: boolean
  refreshToken: number
}

const SELECTABLE_BOX_KEY = 'orange_L'
const ADVANCED_TAYLOR_STONE_KEY = 'advanced_taylor_stone'
type ResourceKey = 'box' | 'stone'
const RESOURCE_NAMES: Record<ResourceKey, string> = {
  box: '選択式ボックス',
  stone: '上級テイラーストーン',
}

function isBouquetItem(item: Pick<Item, 'gift_kind' | 'name'>): boolean {
  return item.gift_kind === 'bouquet' || item.name.includes('\u82b1\u675f')
}

function inventoryGroupRank(item: Item): number {
  if (item.rarity === 'SSR' && !isBouquetItem(item)) {
    return 0
  }
  if (isBouquetItem(item)) {
    return 1
  }
  return 2
}

function sortInventoryItems(items: Item[]): Item[] {
  return [...items].sort((left, right) => {
    const rankDiff = inventoryGroupRank(left) - inventoryGroupRank(right)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return left.name.localeCompare(right.name, 'ja')
  })
}

export function GiftManagementScreen({ bridgeReady, refreshToken }: GiftManagementScreenProps) {
  const [items, setItems] = useState<Item[]>([])
  const [itemInputs, setItemInputs] = useState<Record<number, string>>({})
  const [resourceInputs, setResourceInputs] = useState({ box: '0', stone: '0' })
  const [savedResourceQuantities, setSavedResourceQuantities] = useState({ box: 0, stone: 0 })
  // スクショ取り込みダイアログ (null なら閉じている)
  const [importFiles, setImportFiles] = useState<File[] | null>(null)

  const itemsRef = useRef<Item[]>([])
  const itemInputsRef = useRef<Record<number, string>>({})
  const resourceInputsRef = useRef({ box: '0', stone: '0' })
  const savedResourceQuantitiesRef = useRef({ box: 0, stone: 0 })
  const itemSaveQueueRef = useRef<Record<number, Promise<void>>>({})
  const resourceSaveQueuesRef = useRef<Partial<Record<ResourceKey, Promise<void>>>>({})

  function setResourceState(key: ResourceKey, value: string) {
    resourceInputsRef.current = { ...resourceInputsRef.current, [key]: value }
    setResourceInputs(resourceInputsRef.current)
  }

  function setSavedResourceQuantity(key: ResourceKey, quantity: number) {
    savedResourceQuantitiesRef.current = { ...savedResourceQuantitiesRef.current, [key]: quantity }
    setSavedResourceQuantities(savedResourceQuantitiesRef.current)
  }

  function replaceItems(nextItems: Item[]) {
    itemsRef.current = nextItems
    setItems(nextItems)
  }

  function updateItems(updater: (current: Item[]) => Item[]) {
    const nextItems = updater(itemsRef.current)
    itemsRef.current = nextItems
    startTransition(() => {
      setItems(nextItems)
    })
  }

  function replaceItemInputs(nextInputs: Record<number, string>) {
    itemInputsRef.current = nextInputs
    setItemInputs(nextInputs)
  }

  function updateItemInputs(
    updater: (current: Record<number, string>) => Record<number, string>,
  ) {
    const nextInputs = updater(itemInputsRef.current)
    itemInputsRef.current = nextInputs
    setItemInputs(nextInputs)
  }

  useEffect(() => {
    let disposed = false

    async function load() {
      if (!bridgeReady) {
        return
      }

      const [itemRows, inventoryRows, boxRows, materialRows] = await Promise.all([
        api.list_items(),
        api.get_inventory(),
        api.list_boxes(),
        api.list_crafting_materials(),
      ])
      if (disposed) {
        return
      }

      const inventory = inventoryRows && typeof inventoryRows === 'object' ? inventoryRows : {}
      const nextItems = sortInventoryItems(
        (Array.isArray(itemRows) ? itemRows : []).map((item) => ({
          ...item,
          quantity: Number(inventory[String(item.id)] ?? item.quantity ?? 0),
        })),
      )
      const nextInputs = Object.fromEntries(
        nextItems.map((item) => [item.id, String(item.quantity)]),
      ) as Record<number, string>
      const nextBoxes = boxRows && typeof boxRows === 'object' ? boxRows : {}
      const nextBoxQuantity = String(Number(nextBoxes[SELECTABLE_BOX_KEY] ?? 0))
      const nextStoneQuantity = String(Number(materialRows[ADVANCED_TAYLOR_STONE_KEY] ?? 0))

      replaceItems(nextItems)
      replaceItemInputs(nextInputs)
      setResourceState('box', nextBoxQuantity)
      setResourceState('stone', nextStoneQuantity)
      setSavedResourceQuantity('box', Number(nextBoxQuantity))
      setSavedResourceQuantity('stone', Number(nextStoneQuantity))
    }

    void load()

    return () => {
      disposed = true
    }
  }, [bridgeReady, refreshToken])

  function queueItemSave(itemId: number) {
    const raw = itemInputsRef.current[itemId] ?? '0'
    const savedQuantity = Number(itemsRef.current.find((item) => item.id === itemId)?.quantity ?? 0)
    const quantity = resolveQuantityInput(raw, savedQuantity)
    if (quantity === null) {
      window.alert('数量は0以上の整数で入力してください。「+3」「-2」で今の数から増減できます。')
      updateItemInputs((current) => ({ ...current, [itemId]: String(savedQuantity) }))
      return
    }

    const normalized = String(quantity)
    updateItemInputs((current) => ({ ...current, [itemId]: normalized }))
    updateItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, quantity } : item)),
    )

    const previous = itemSaveQueueRef.current[itemId] ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.set_inventory_quantity(itemId, quantity)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          window.alert(`保存に失敗しました: ${message}`)
        }
      })

    itemSaveQueueRef.current[itemId] = queued
    void queued.finally(() => {
      if (itemSaveQueueRef.current[itemId] === queued) {
        delete itemSaveQueueRef.current[itemId]
      }
    })
  }

  function queueResourceSave(key: ResourceKey) {
    const raw = resourceInputsRef.current[key]
    const quantity = resolveQuantityInput(raw, savedResourceQuantitiesRef.current[key])
    if (quantity === null) {
      window.alert(`${RESOURCE_NAMES[key]}在庫は0以上の整数で入力してください。「+3」「-2」で今の数から増減できます。`)
      setResourceState(key, String(savedResourceQuantitiesRef.current[key]))
      return
    }

    const normalized = String(quantity)
    setResourceState(key, normalized)
    // 次の「+3」などがこの値を基準にできるよう、保存完了を待たずに反映する
    setSavedResourceQuantity(key, quantity)

    const previous = resourceSaveQueuesRef.current[key] ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          if (key === 'box') {
            await api.set_box_quantity(SELECTABLE_BOX_KEY, quantity)
          } else {
            await api.set_crafting_material_quantity(ADVANCED_TAYLOR_STONE_KEY, quantity)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          window.alert(`保存に失敗しました: ${message}`)
        }
      })

    resourceSaveQueuesRef.current[key] = queued
    void queued.finally(() => {
      if (resourceSaveQueuesRef.current[key] === queued) {
        delete resourceSaveQueuesRef.current[key]
      }
    })
  }

  // ダイアログが閉じているときに画像が貼り付けられたら、取り込みを始める
  useEffect(() => {
    if (importFiles !== null) return
    const handlePaste = (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData?.items)
      if (files.length) {
        event.preventDefault()
        setImportFiles(files)
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [importFiles])

  function applyImportedQuantities(updates: Array<{ itemId: number; quantity: number }>) {
    updateItemInputs((current) => {
      const next = { ...current }
      for (const update of updates) next[update.itemId] = String(update.quantity)
      return next
    })
    for (const update of updates) queueItemSave(update.itemId)
    setImportFiles(null)
  }

  function revertItemInput(itemId: number) {
    const savedQuantity = itemsRef.current.find((item) => item.id === itemId)?.quantity ?? 0
    updateItemInputs((current) => ({ ...current, [itemId]: String(savedQuantity) }))
  }

  function revertResourceInput(key: ResourceKey) {
    setResourceState(key, String(savedResourceQuantitiesRef.current[key]))
  }

  // 複数の数値が貼り付けられたら、そのタイルから並び順に入力して保存する
  function applyPastedQuantities(startItemId: number, values: number[]) {
    const order = itemsRef.current
    const startIndex = order.findIndex((item) => item.id === startItemId)
    if (startIndex < 0) {
      return
    }
    const targets = order.slice(startIndex, startIndex + values.length)
    updateItemInputs((current) => {
      const next = { ...current }
      targets.forEach((item, index) => {
        next[item.id] = String(values[index])
      })
      return next
    })
    for (const item of targets) {
      queueItemSave(item.id)
    }
    const ignored = values.length - targets.length
    if (ignored > 0) {
      window.alert(`${targets.length} 件を入力しました。末尾の ${ignored} 件は対応するタイルが無いため無視しました。`)
    }
  }

  return (
    <div
      className="screen-stack gift-management-screen"
      onDragOver={(event) => {
        if (importFiles === null && [...event.dataTransfer.types].includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        if (importFiles !== null) return
        const files = imageFilesFrom(event.dataTransfer.files)
        if (files.length) {
          event.preventDefault()
          setImportFiles(files)
        }
      }}
    >
      <InventoryEditor
        onOpenScreenshotImport={() => setImportFiles([])}
        boxQuantity={resourceInputs.box}
        stoneQuantity={resourceInputs.stone}
        savedBoxQuantity={savedResourceQuantities.box}
        savedStoneQuantity={savedResourceQuantities.stone}
        items={items}
        quantityInputs={itemInputs}
        onBoxQuantityChange={(value) => setResourceState('box', value)}
        onStoneQuantityChange={(value) => setResourceState('stone', value)}
        onItemQuantityChange={(itemId, value) =>
          updateItemInputs((current) => ({ ...current, [itemId]: value }))
        }
        onSaveBoxQuantity={() => queueResourceSave('box')}
        onSaveStoneQuantity={() => queueResourceSave('stone')}
        onSaveItemQuantity={queueItemSave}
        onRevertBoxQuantity={() => revertResourceInput('box')}
        onRevertStoneQuantity={() => revertResourceInput('stone')}
        onRevertItemQuantity={revertItemInput}
        onPasteItemQuantities={applyPastedQuantities}
      />
      {importFiles !== null ? (
        <ScreenshotImportModal
          initialFiles={importFiles}
          items={items}
          onApply={applyImportedQuantities}
          onClose={() => setImportFiles(null)}
        />
      ) : null}
    </div>
  )
}
