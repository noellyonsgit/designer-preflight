import ky from 'ky'
import { useEffect, useState } from 'react'

export default function HomeV2() {
  const [posts, setPosts] = useState([])
  useEffect(() => {
    ky.get('/api/v2/posts').json().then(setPosts)
  }, [])
  return (
    <section className="grid gap-6 p-6">
      {posts.map((p) => (
        <article key={p.id}>{p.title}</article>
      ))}
    </section>
  )
}
