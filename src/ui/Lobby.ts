import type { Color as Side } from 'chess.js';

const NAME_KEY = 'wizard-chess-name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

/** The "Play online" dialog: create a game, share the invite link, or join one. */
export class Lobby {
  private readonly el = document.querySelector<HTMLElement>('.modal.lobby')!;
  private readonly error = this.el.querySelector<HTMLElement>('.lobby-error')!;
  private readonly link = this.el.querySelector<HTMLInputElement>('.invite-link')!;
  private color: Side | 'random' = 'random';
  private cancel: () => void = () => {};

  constructor() {
    this.el.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.color = btn.dataset.color as Side | 'random';
        this.el.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      });
    });
    this.el.querySelectorAll('[data-lobby="cancel"]').forEach((b) => b.addEventListener('click', () => this.cancel()));
    this.el.querySelector('[data-lobby="hide"]')!.addEventListener('click', () => this.hide());
    this.el.querySelector('[data-lobby="copy"]')!.addEventListener('click', () => void this.copy());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.el.dataset.step === 'invite') this.hide();
        else this.cancel();
      }
      e.stopPropagation(); // keep game shortcuts out of the text fields
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Ask for a name and colour. Resolves null if cancelled. */
  askCreate(submit: (name: string, color: Side | 'random') => Promise<void>): Promise<boolean> {
    return this.form('create', (name) => submit(name, this.color));
  }

  /** Ask an invited player for their name. Resolves false if they decline. */
  askJoin(hostName: string, submit: (name: string) => Promise<void>): Promise<boolean> {
    this.el.querySelector('.join-text')!.textContent = `${hostName} invites you to a game of Wizard Chess.`;
    return this.form('join', submit);
  }

  /** Show the invite link while waiting for the opponent. */
  showInvite(url: string, onCancel: () => void): void {
    this.link.value = url;
    this.cancel = onCancel;
    this.show('invite');
    this.link.select();
  }

  hide(): void {
    this.el.hidden = true;
    this.el.classList.remove('busy');
  }

  private show(step: string): void {
    this.el.dataset.step = step;
    this.error.textContent = '';
    this.el.hidden = false;
  }

  private form(step: 'create' | 'join', submit: (name: string) => Promise<void>): Promise<boolean> {
    const form = this.el.querySelector<HTMLFormElement>(`form[data-step="${step}"]`)!;
    const input = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    input.value = savedName();
    this.show(step);
    input.focus();
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        form.onsubmit = null;
        if (!ok) this.hide();
        resolve(ok);
      };
      this.cancel = () => done(false);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        saveName(name);
        this.error.textContent = '';
        this.el.classList.add('busy');
        try {
          await submit(name);
          this.el.classList.remove('busy');
          done(true);
        } catch (err) {
          this.el.classList.remove('busy');
          this.error.textContent = (err as Error).message;
        }
      };
    });
  }

  private async copy(): Promise<void> {
    const btn = this.el.querySelector<HTMLButtonElement>('[data-lobby="copy"]')!;
    try {
      await navigator.clipboard.writeText(this.link.value);
    } catch {
      this.link.select();
      document.execCommand('copy');
    }
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = 'Copy'), 1500);
  }
}
