'use client'

import { useState } from 'react'

import { CompanionManager } from '@/components/companion-manager'
import { PlaceManager } from '@/components/place-manager'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { CompanionRow } from '@/lib/companion-format'
import type { PlaceRow } from '@/lib/place-format'

export function ListasClient({
  places,
  companions,
}: {
  places: PlaceRow[]
  companions: CompanionRow[]
}) {
  const [tab, setTab] = useState<'lugares' | 'amigos'>('lugares')
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <div className="px-5 pt-3">
        <TabsList>
          <TabsTrigger value="lugares">Lugares</TabsTrigger>
          <TabsTrigger value="amigos">Amigos</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="lugares">
        <PlaceManager places={places} />
      </TabsContent>
      <TabsContent value="amigos">
        <CompanionManager companions={companions} />
      </TabsContent>
    </Tabs>
  )
}
