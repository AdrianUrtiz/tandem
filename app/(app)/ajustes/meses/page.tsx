import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { MsiConcentrado } from '@/components/msi-concentrado'

import { getMsiConcentrado } from '@/lib/msi'

import { auth } from '@/auth'

export const metadata = { title: 'Pagos a meses' }
export const dynamic = 'force-dynamic'

export default async function MesesPage() {
  const session = await auth()
  const meId = (session?.user as { id?: string } | undefined)?.id
  if (!meId) redirect('/login')

  let msi: Awaited<ReturnType<typeof getMsiConcentrado>>['msi'] = []
  let msiPayments: Awaited<ReturnType<typeof getMsiConcentrado>>['msiPayments'] =
    {}
  try {
    const res = await getMsiConcentrado(meId)
    msi = res.msi
    msiPayments = res.msiPayments
  } catch {
    msi = []
    msiPayments = {}
  }

  return (
    <>
      <div className="px-5 pt-4">
        <Link
          href="/ajustes"
          className="inline-flex items-center gap-1 text-sm font-semibold text-(--muted-foreground)">
          <ChevronLeft className="size-4" /> Perfil
        </Link>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pt-2 pb-4">
        <div>
          <p className="text-4xl font-extrabold tracking-tight">Pagos a meses</p>
          <p className="mt-1 text-sm text-(--muted-foreground)">
            Tus compras a meses, tuyas y compartidas con tu pareja.
          </p>
        </div>
        <MsiConcentrado meId={meId} items={msi} payments={msiPayments} />
      </div>
    </>
  )
}
