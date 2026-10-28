import { AjustesClient } from '@/components/ajustes-client'

import { getPairingState } from '@/lib/couple-actions'
import { prisma } from '@/lib/prisma'

import { auth } from '@/auth'

export const metadata = { title: 'Perfil' }

export default async function AjustesPage() {
  const session = await auth()
  const meId = (session?.user as { id?: string } | undefined)?.id
  let username: string | undefined
  let displayName = 'Mi cuenta'
  let avatar: string | null = null
  if (meId) {
    try {
      const me = await prisma.user.findUnique({
        where: { id: meId },
        select: { username: true, name: true, avatar: true },
      })
      username = me?.username
      if (me?.name) displayName = me.name
      avatar = me?.avatar ?? null
    } catch {
      username = undefined
    }
  }
  let pairing = null
  try {
    const res = await getPairingState()
    if ('ok' in res) {
      pairing = {
        pairCode: res.pairCode,
        partner: res.partner,
        householdId: res.householdId,
        sent: res.sent,
        received: res.received,
      }
    }
  } catch {
    pairing = null
  }

  return (
    <AjustesClient
      username={username}
      displayName={displayName}
      avatar={avatar}
      initialPairing={pairing}
    />
  )
}
