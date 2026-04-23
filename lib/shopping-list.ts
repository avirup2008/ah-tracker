import type { ShoppingListItem } from './db.ts'
import { buildFamilyKey } from './product-catalog.ts'

export function markPantryCoveredShoppingList(
  shoppingList: ShoppingListItem[],
  pantryFamilyKeys: string[] = []
): ShoppingListItem[] {
  const pantryFamilies = new Set(pantryFamilyKeys.filter(Boolean))
  if (pantryFamilies.size === 0) return shoppingList

  return shoppingList
    .map((section) => {
      const items = section.items
        .map((item) => ({
          ...item,
          pantry_covered: pantryFamilies.has(buildFamilyKey(item.ah_name)),
        }))
        .sort((a, b) => Number(a.pantry_covered) - Number(b.pantry_covered))

      return { ...section, items }
    })
    .filter((section) => section.items.length > 0)
}
