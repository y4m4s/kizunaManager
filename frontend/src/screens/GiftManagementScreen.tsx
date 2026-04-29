import { startTransition, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { InventoryEditor } from '../components/optimize/InventoryEditor'
import type { Item } from '../types'

type GiftManagementScreenProps = {
  bridgeReady: boolean
  refreshToken: number
}

const SELECTABLE_BOX_KEY = 'orange_L'

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
  const [boxQuantity, setBoxQuantity] = useState('0')

  const itemsRef = useRef<Item[]>([])
  const itemInputsRef = useRef<Record<number, string>>({})
  const boxQuantityRef = useRef('0')
  const savedBoxQuantityRef = useRef(0)
  const itemSaveQueueRef = useRef<Record<number, Promise<void>>>({})
  const boxSaveQueueRef = useRef<Promise<void> | null>(null)

  function setBoxState(value: string) {
    boxQuantityRef.current = value
    setBoxQuantity(value)
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

      const [itemRows, inventoryRows, boxRows] = await Promise.all([
        api.list_items(),
        api.get_inventory(),
        api.list_boxes(),
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

      replaceItems(nextItems)
      replaceItemInputs(nextInputs)
      setBoxState(nextBoxQuantity)
      savedBoxQuantityRef.current = Number(nextBoxQuantity)
    }

    void load()

    return () => {
      disposed = true
    }
  }, [bridgeReady, refreshToken])

  function queueItemSave(itemId: number) {
    const raw = itemInputsRef.current[itemId] ?? '0'
    const quantity = Number.parseInt(raw || '0', 10)
    if (Number.isNaN(quantity) || quantity < 0) {
      window.alert('数量は0以上の整数で入力してください。')
      const fallback = String(itemsRef.current.find((item) => item.id === itemId)?.quantity ?? 0)
      updateItemInputs((current) => ({ ...current, [itemId]: fallback }))
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

  function queueBoxSave() {
    const quantity = Number.parseInt(boxQuantityRef.current || '0', 10)
    if (Number.isNaN(quantity) || quantity < 0) {
      window.alert('選択式ボックス在庫は0以上の整数で入力してください。')
      setBoxState(String(savedBoxQuantityRef.current))
      return
    }

    const normalized = String(quantity)
    setBoxState(normalized)

    const previous = boxSaveQueueRef.current ?? Promise.resolve()
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.set_box_quantity(SELECTABLE_BOX_KEY, quantity)
          savedBoxQuantityRef.current = quantity
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          window.alert(`保存に失敗しました: ${message}`)
        }
      })

    boxSaveQueueRef.current = queued
    void queued.finally(() => {
      if (boxSaveQueueRef.current === queued) {
        boxSaveQueueRef.current = null
      }
    })
  }

  return (
    <div className="screen-stack gift-management-screen">
      <InventoryEditor
        boxQuantity={boxQuantity}
        items={items}
        quantityInputs={itemInputs}
        onBoxQuantityChange={setBoxState}
        onItemQuantityChange={(itemId, value) =>
          updateItemInputs((current) => ({ ...current, [itemId]: value }))
        }
        onSaveBoxQuantity={queueBoxSave}
        onSaveItemQuantity={queueItemSave}
      />
    </div>
  )
}
