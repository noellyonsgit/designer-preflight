import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Prints shop</h1>
      <p>Order a print and track it.</p>
      <Link href="/orders">Your orders</Link>
    </main>
  )
}
