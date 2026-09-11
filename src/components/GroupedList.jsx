import './GroupedList.css';

/* A grouped list: a label sitting outside a single low surface that holds flat
   rows separated by inset hairlines.

   This replaces the card-per-item pattern the app used everywhere. One box per
   item cost about three quarters of the vertical space and made every screen
   read as generated. Grouping comes from adjacency and one shared edge, which
   is how a settings pane, a bank statement and a receipt all do it.

   Deliberately has no elevation of its own: `.card` means lifted, and a page
   made of lifted things has no hierarchy left to spend. */

export function GroupedList({ label, meta, action, children, className = '', ...rest }) {
  return (
    <section className={`grouped-section ${className}`.trim()} {...rest}>
      {label ? (
        <div className="grouped-head">
          <h2 className="grouped-label">{label}</h2>
          {meta ? <span className="grouped-meta tabular">{meta}</span> : null}
          {action}
        </div>
      ) : null}
      <div className="grouped">{children}</div>
    </section>
  );
}

/* One row. `as` exists because the list page needs real <li> semantics inside a
   <ul>, while the comparison page needs rows that are themselves buttons. */
export function GroupedRow({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`grouped-row ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
