import { locale, t } from '../i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './kit.css';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
export { cx };

// ------------------------------------------------------------------ buttons

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  block,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={cx('icon-btn', active && 'is-active', className)}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ form fields

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, leading, trailing, className, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className={cx('field', error && 'has-error', className)} htmlFor={inputId}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-box">
        {leading && <span className="field-icon">{leading}</span>}
        <input id={inputId} aria-invalid={!!error} {...rest} />
        {trailing && <span className="field-trailing">{trailing}</span>}
      </span>
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

// ------------------------------------------------------------------ small pieces

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label={t('Loading')} />;
}

export function ProgressBar({ value, tone = 'gold', className }: { value: number; tone?: 'gold' | 'violet' | 'success'; className?: string }) {
  return (
    <div className={cx('progress', `progress-${tone}`, className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'violet' | 'success' | 'danger' }) {
  return <span className={cx('badge', `badge-${tone}`)}>{children}</span>;
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: 'none' }}>
      <defs>
        <linearGradient id="coin-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3a6" />
          <stop offset="1" stopColor="#d99a40" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#coin-g)" stroke="#8a5a1c" strokeWidth="1" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#a8722c" strokeWidth="1.2" opacity="0.7" />
      <path d="M12 7.2 l1.5 3.1 3.3 .4 -2.4 2.3 .6 3.3 -3 -1.6 -3 1.6 .6 -3.3 -2.4 -2.3 3.3 -.4 Z" fill="#a8722c" opacity="0.85" />
    </svg>
  );
}

export const formatNumber = (n: number) => n.toLocaleString(locale());

export function Coins({ amount, signed, size = 16 }: { amount: number; signed?: boolean; size?: number }) {
  return (
    <span className="coins">
      <CoinIcon size={size} />
      <span>
        {signed && amount > 0 ? '+' : ''}
        {formatNumber(amount)}
      </span>
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 440,
  dismissable = true,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
  dismissable?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    // focus the first text field; otherwise the dialog itself (no stray focus ring on a button)
    (panel.current?.querySelector<HTMLElement>('input:not([readonly])') ?? panel.current)?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose?.()}>
      <div className="modal-panel" ref={panel} style={{ maxWidth: width }} role="dialog" aria-modal tabIndex={-1}>
        {dismissable && onClose && (
          <IconButton label={t('Close')} className="modal-close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        )}
        {(title || subtitle) && (
          <header className="modal-head">
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ toasts

export interface ToastAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: 'neutral' | 'success' | 'danger';
  actions: ToastAction[];
  leaving?: boolean;
}

export interface ToastOptions {
  tone?: ToastItem['tone'];
  actions?: ToastAction[];
  /** seconds; 0 keeps it until dismissed. Defaults to 4 (or sticky with actions). */
  duration?: number;
}

type ToastFn = (message: ReactNode, options?: ToastOptions) => () => void;

const ToastContext = createContext<ToastFn>(() => () => {});

export const useToast = () => useContext(ToastContext);

/** Module-level access for non-React code (game modes). Set by ToastProvider. */
export let toast: ToastFn = () => () => {};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 250);
  }, []);

  const show = useCallback<ToastFn>(
    (message, options = {}) => {
      const id = nextId.current++;
      const actions = options.actions ?? [];
      setItems((list) => [...list.slice(-3), { id, message, tone: options.tone ?? 'neutral', actions }]);
      const duration = options.duration ?? (actions.length ? 0 : 4);
      if (duration) setTimeout(() => dismiss(id), duration * 1000);
      return () => dismiss(id);
    },
    [dismiss],
  );

  useEffect(() => {
    toast = show;
  }, [show]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={cx('toast', `toast-${t.tone}`, t.leaving && 'is-leaving')}>
              <span className="toast-msg">{t.message}</span>
              {t.actions.map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant={a.primary ? 'primary' : 'ghost'}
                  onClick={() => {
                    dismiss(t.id);
                    a.run();
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// ------------------------------------------------------------------ confirm dialog

interface ConfirmRequest {
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  resolve: (ok: boolean) => void;
}

let showConfirm: (req: ConfirmRequest) => void = (req) => req.resolve(window.confirm(req.title));

/** Styled replacement for window.confirm. Resolves true when confirmed. */
export function confirmDialog(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => showConfirm({ ...options, resolve }));
}

/** Renders confirm dialogs requested through `confirmDialog`. Mount once. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    showConfirm = setReq;
  }, []);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  return (
    <Modal open={!!req} onClose={() => close(false)} title={req?.title} subtitle={req?.text} width={400}>
      <div className="confirm-actions">
        <Button variant="ghost" onClick={() => close(false)}>
          {req?.cancelLabel ?? t('Cancel')}
        </Button>
        <Button variant={req?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
          {req?.confirmLabel ?? t('Confirm')}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ switch

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx('switch', checked && 'is-on')} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
