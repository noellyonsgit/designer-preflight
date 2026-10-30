export default function Header() {
  return (
    <div className="header" style={{ padding: 16, color: '#f60' }}>
      <span onClick={() => (window.location.href = '/')}>Studio</span>
    </div>
  )
}
