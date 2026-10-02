import React, { createContext, useContext, useEffect, useRef } from "react";
export const FeedbackContext = createContext("");

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  building:
    "M4 21V5h10v16 M14 10h6v11 M2 21h20 M7 8h4 M7 12h4 M7 16h4 M17 14h1 M17 18h1",
  layers: "m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
  file: "M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h6",
  check: "m5 12 4 4L19 6",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-5 10 3 3 6-6",
  arrow: "M4 12h16 m-6-6 6 6-6 6",
  back: "M20 12H4 m6-6-6 6 6 6",
  plus: "M12 5v14 M5 12h14",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  upload: "M12 16V3 m-5 5 5-5 5 5 M3 15v6h18v-6",
  download: "M12 3v13 m-5-5 5 5 5-5 M3 16v5h18v-5",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2",
  people:
    "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M2 21v-3c0-6 14-6 14 0v3 M16 4c5 0 5 7 0 7 M18 14c3 0 4 2 4 5v2",
  logout: "M9 3H3v18h6 M9 12h12 m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12 M6 18 18 6",
  edit: "m16 3 5 5-12 12-6 1 1-6z M14 5l5 5",
  restore: "M3 10a9 9 0 1 1 0 6 M3 3v7h7",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  alert: "m12 3 10 18H2z M12 9v5 M12 17v1",
};
export function Icon({ name, size = 19, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}
export const label = (value) => (value || "not_started").replaceAll("_", " ");
export const date = (value) =>
  value
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00" : value,
      ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No due date";
export function Badge({ status }) {
  return <span className={`badge ${status}`}>{label(status)}</span>;
}
export function Empty({ icon = "file", title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const error = useContext(FeedbackContext);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide-modal" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">CUNIX WORKSPACE</span>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      <div className="actions">{actions}</div>
    </header>
  );
}
export function Stat({ icon, title, value, detail, tone = "" }) {
  return (
    <article className={`stat ${tone}`}>
      <div className="stat-top">
        <span>{title}</span>
        <Icon name={icon} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
