import { startTransition, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { InventoryEditor } from '../components/optimize/InventoryEditor'
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
      savedResourceQuantitiesRef.current = { box: Number(nextBoxQuantity), stone: Number(nextStoneQuantity) }
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

  function queueResourceSave(key: ResourceKey) {
    const raw = resourceInputsRef.current[key].trim() || '0'
    const quantity = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(quantity)) {
      window.alert(`${RESOURCE_NAMES[key]}在庫は0以上の整数で入力してください。`)
      setResourceState(key, String(savedResourceQuantitiesRef.current[key]))
      return
    }

    const normalized = String(quantity)
    setResourceState(key, normalized)

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
          savedResourceQuantitiesRef.current[key] = quantity
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

  return (
    <div className="screen-stack gift-management-screen">
      <InventoryEditor
        boxQuantity={resourceInputs.box}
        stoneQuantity={resourceInputs.stone}
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
      />
    </div>
  )
}
