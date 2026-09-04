export interface Item {
  id: number
  class_name: string
  name: string
  item_slot_type?: 'weapon' | 'vitality' | 'spirit'
  item_tier?: 1 | 2 | 3 | 4
  cost?: number
  shop_image?: string
  shop_image_webp?: string
  is_active_item?: boolean
  activation?: string
  shopable?: boolean
  upgrades?: { property_upgrades?: { name: string; bonus: string }[] }[]
  properties?: Record<string, { value?: string }>
  tooltip_sections?: {
    section_type: string
    section_attributes: { loc_string?: string; properties?: string[] }[]
  }[]
}

export interface Hero {
  id: number
  class_name: string
  name: string
  player_selectable: boolean
  disabled: boolean
  in_development: boolean
  hero_type?: string
  tags?: string[]
  images?: Record<string, string>
  items?: Record<string, string>
  starting_stats?: Record<string, { value: number; display_stat_name: string }>
}

export interface Ability {
  id: number
  class_name: string
  name: string
  hero: number
  image?: string
}

export interface ItemStat {
  item_id: number
  bucket: number
  wins: number
  losses: number
  matches: number
  players: number
  avg_buy_time_s?: number
  avg_sell_time_s?: number
  avg_buy_time_relative?: number
  avg_sell_time_relative?: number
}

export interface AbilityOrderStat {
  abilities: number[]
  wins: number
  losses: number
  matches: number
  players: number
}

export interface ItemPermutationStat {
  item_ids: number[]
  wins: number
  losses: number
  matches: number
}

export interface ZergMatchItem {
  game_time_s: number
  item_id: number
  upgrade_id: number
  sold_time_s: number
}

export interface ZergMatch {
  match_id: number
  start_time: number
  match_result: number
  player_team: number
  game_mode: number
  match_mode: number
  items: ZergMatchItem[]
}

export interface AppUserMatch {
  match_id: number
  hero_id: number
  match_duration_s: number
  game_mode: number
  match_mode: number
}

export interface BuildItem {
  item: Item
  phase: 'early' | 'mid' | 'late'
  runningTotal: number
  score: number
}

export interface AbilityStep {
  ability: Ability
  slot: number
  isUpgrade: boolean
}

export interface Build {
  id: string
  name: string
  description: string
  items: BuildItem[]
  abilityOrder: AbilityStep[]
}
