import { motion } from 'framer-motion'

export default function Home({ posts }) {
  return (
    <main className="p-4">
      <motion.h1 animate={{ opacity: [0, 1], y: [20, 0] }} className="text-4xl font-bold">
        Design studio
      </motion.h1>
      <p className="text-gray-400">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      <ul>
        {posts.map((p) => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </main>
  )
}
