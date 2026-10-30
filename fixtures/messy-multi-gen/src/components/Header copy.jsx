export default function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <a href="/" className="font-bold text-[#ff5b20]">Studio</a>
      <nav className="flex gap-4">
        <a href="/work">Work</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    </header>
  )
}
