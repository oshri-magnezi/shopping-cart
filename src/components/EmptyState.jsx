import './EmptyState.css';

export function EmptyState({ art: Art, icon: Icon, title, text, children }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {Art ? <Art /> : <Icon size={28} strokeWidth={1.75} />}
      </span>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-text">{text}</p>
      {children}
    </div>
  );
}
