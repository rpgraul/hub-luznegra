interface AIAssistantFloatingButtonProps {
  onClick: () => void
  isOpen: boolean
}

export default function AIAssistantFloatingButton({
  onClick,
  isOpen,
}: AIAssistantFloatingButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Assistente IA"
      title="Assistente IA (DeepSeek)"
      className={`fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-2xl shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 ${
        isOpen
          ? 'bg-muted text-foreground'
          : 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-indigo-500/25 ring-2 ring-white/20'
      }`}
    >
      {isOpen ? (
        <i className="fa-solid fa-xmark text-sm" />
      ) : (
        <span className="text-xl">🦐</span>
      )}
    </button>
  )
}
