import { useEffect, useState } from 'react';
import { setToastListener } from '../toast';

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    setToastListener((m) => {
      setMsg(m);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2600);
    });
    return () => setToastListener(null);
  }, []);

  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}
