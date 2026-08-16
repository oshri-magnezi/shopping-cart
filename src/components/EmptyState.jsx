import './EmptyState.css';

export function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon size={28} strokeWidth={1.75} />
      </span>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-text">{text}</p>
    </div>
  );
}
