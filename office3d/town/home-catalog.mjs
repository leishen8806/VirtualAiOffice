const item = (id, name, category, w, d, height, layer, blocks, stackable = false) =>
  Object.freeze({
    id,
    name,
    category,
    footprint: Object.freeze({ w, d }),
    height,
    layer,
    blocks,
    stackable,
  })

export const CATEGORIES = Object.freeze(['furniture', 'decor', 'plant', 'light', 'wall_art', 'rug'])
export const LAYERS = Object.freeze(['floor', 'wall', 'rug'])

export const CATALOG = Object.freeze([
  item('bed_single', '单人床', 'furniture', 4, 3, 0.6, 'floor', true),
  item('sofa_two', '双人沙发', 'furniture', 4, 2, 0.8, 'floor', true),
  item('table_dining', '餐桌', 'furniture', 3, 2, 0.75, 'floor', true),
  item('chair_wood', '木椅', 'furniture', 1, 1, 0.9, 'floor', true),
  item('desk_work', '书桌', 'furniture', 3, 2, 0.75, 'floor', true),
  item('wardrobe', '衣柜', 'furniture', 2, 1, 2.0, 'floor', true),
  item('bookshelf', '书架', 'furniture', 3, 1, 1.8, 'wall', true),
  item('tv_stand', '电视柜', 'furniture', 3, 1, 0.5, 'wall', true),
  item('plant_pot', '盆栽', 'plant', 1, 1, 1.0, 'floor', true),
  item('lamp_floor', '落地灯', 'light', 1, 1, 1.6, 'floor', true),
  item('rug_round', '圆形地毯', 'rug', 4, 4, 0.02, 'rug', false),
  item('frame_art', '挂画', 'wall_art', 2, 1, 1.0, 'wall', false),
])

export const ITEM_IDS = Object.freeze(CATALOG.map((entry) => entry.id))

const byId = new Map(CATALOG.map((entry) => [entry.id, entry]))

export function getItem(id) {
  return byId.get(id) || null
}
