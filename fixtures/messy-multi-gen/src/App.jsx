import axios from 'axios'
import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'

export default function App() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    // TODO: move this to the new API client
    axios.get('/api/posts').then((res) => setPosts(res.data)).catch(() => {})
    console.log('posts loaded')
  }, [])

  return (
    <>
      <Header />
      <Home posts={posts} />
    </>
  )
}
