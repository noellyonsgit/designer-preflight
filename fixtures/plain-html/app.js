const launch = new Date('2026-11-01 10:00')
console.log('launch', launch)
requestIdleCallback(() => console.log('idle'))
fetch('/api/subscribers.json').then((r) => r.json()).catch(() => {})
