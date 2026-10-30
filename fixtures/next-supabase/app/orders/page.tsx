'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Order = { id: string; email: string; total: number; address: string }

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    supabase.from('orders').select('*').then(({ data }) => setOrders(data ?? []))
  }, [])

  return (
    <main>
      <h1>Your orders</h1>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            {o.email}: £{o.total}
          </li>
        ))}
      </ul>
    </main>
  )
}
