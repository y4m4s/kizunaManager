import { dataAssetUrl } from '../api'

const ITEM_IMAGE_DIR = 'images/items'

export type EffectIconKey = 'small' | 'medium' | 'large' | 'extra_large'

const EFFECT_ICON_FILES: Record<EffectIconKey, string> = {
  small: 'Cafe_Interaction_Gift_01.png',
  medium: 'Cafe_Interaction_Gift_02.png',
  large: 'Cafe_Interaction_Gift_03.png',
  extra_large: 'Cafe_Interaction_Gift_04.png',
}

export function effectIconUrl(effect: string): string | null {
  if (effect in EFFECT_ICON_FILES) {
    return dataAssetUrl(`${ITEM_IMAGE_DIR}/${EFFECT_ICON_FILES[effect as EffectIconKey]}`)
  }
  return null
}

export const SELECTABLE_BOX_ICON_URL = dataAssetUrl(
  `${ITEM_IMAGE_DIR}/item_icon_favor_selection.webp`,
)
