import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PlaceManager } from '@/components/place-manager'

import { getPlaces } from '@/lib/places'

import { auth } from '@/auth'

export const metadata = { title: 'Lugares' }
export const dynamic = 'force-dynamic'

export default async function LugaresPage() {
  const session = await auth()
  const meId = (session?.user as { id?: string } | undefined)?.id
  if (!meId) redirect('/login')
  const places = await getPlaces(meId)

  return (
    <>
      <div className="px-5 pt-4">
        <Link
          href="/ajustes"
          className="inline-flex items-center gap-1 text-sm font-semibold text-(--muted-foreground)">
          <ChevronLeft className="size-4" /> Perfil
        </Link>
      </div>
      <PlaceManager places={places} />
    </>
  )
}
