const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? 'sk-proj-FixtureOnlyNotARealKey0000000000000000000000aB12'

export async function ask(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  return data.choices[0].message.content
}
