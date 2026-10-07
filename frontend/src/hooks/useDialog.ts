import { useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
let previousOverflow = '';

/** Compartilha foco, Escape e bloqueio de rolagem entre modais, inclusive aninhados. */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialogs.push(dialog);
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
      .filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled') && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
    function onKey(event: KeyboardEvent) {
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0] ?? dialog;
      const last = items[items.length - 1] ?? dialog;
      if (event.shiftKey && (document.activeElement === first || !dialog!.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog!.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      dialogs.splice(dialogs.indexOf(dialog), 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return ref;
}
