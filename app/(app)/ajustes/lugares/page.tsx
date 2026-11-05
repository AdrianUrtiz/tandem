import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Las listas viven ahora en /ajustes/listas (tabs Lugares | Amigos).
export default function LugaresLegacyPage() {
  redirect('/ajustes/listas')
}
