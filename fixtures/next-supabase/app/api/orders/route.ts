import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase.from('orders').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { id } = await request.json()
  await supabase.from('orders').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
