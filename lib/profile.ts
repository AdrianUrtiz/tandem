export const PROFILE_ICONS = [
  'initials',
  'User',
  'Smile',
  'Star',
  'Heart',
  'Cat',
  'Dog',
  'Ghost',
  'Rocket',
  'Music',
] as const

export type ProfileIcon = (typeof PROFILE_ICONS)[number]

/** "color:icono" guardado en User.avatar. Ej. "#6366f1:initials", "#ec4899:Cat". */
export function encodeAvatar(color: string, icon: string): string {
  return `${color}:${icon}`
}

export function parseAvatar(
  raw: string | null | undefined,
): { color: string; icon: ProfileIcon } {
  if (!raw || !raw.includes(':'))
    return { color: '#6366f1', icon: 'initials' }
  const [color, icon] = raw.split(':')
  const c = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color! : '#6366f1'
  const i = (PROFILE_ICONS as readonly string[]).includes(icon ?? '')
    ? (icon as ProfileIcon)
    : 'initials'
  return { color: c, icon: i }
}
