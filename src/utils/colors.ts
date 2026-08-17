const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function hashString(input: string): number {
  let hash = FNV_OFFSET
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

export const USER_COLOR_SATURATION = 70
export const USER_COLOR_LIGHTNESS = 50
export const USER_ROW_ALPHA = 0.04

export function userHue(userId: string): number {
  return hashString(userId) % 360
}

export function userColor(userId: string): string {
  return `hsl(${userHue(userId)}, ${USER_COLOR_SATURATION}%, ${USER_COLOR_LIGHTNESS}%)`
}

export function userColorWithAlpha(userId: string, alpha: number): string {
  return `hsla(${userHue(userId)}, ${USER_COLOR_SATURATION}%, ${USER_COLOR_LIGHTNESS}%, ${alpha})`
}

export function userRowColor(userId: string): string {
  return userColorWithAlpha(userId, USER_ROW_ALPHA)
}