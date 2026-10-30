import { useState } from 'react'
import moment from 'moment'
import { ask } from './lib/openai.js'

export default function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const launch = new Date('2025-03-01 09:00')

  return (
    <div className="page">
      <div className="logo" onClick={() => (window.location.href = '/')}>
        <img src="/logo.svg" />
      </div>
      <p className="muted">Launching {moment(launch).fromNow()}</p>
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything" />
      <div className="send" onClick={async () => setAnswer(await ask(prompt))}>
        Send
      </div>
      <p>{answer}</p>
    </div>
  )
}
