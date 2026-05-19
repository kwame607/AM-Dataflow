export function genRef(prefix = 'DF'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`.substring(0, 26);
}

export function detectNetwork(phone: string): string | null {
  const p = phone.replace(/\D/g, '');
  if (!p.startsWith('0') || p.length !== 10) return null;
  const pref = p.substring(0, 3);
  const mtn  = ['024', '054', '055', '059', '025'];
  const tel  = ['020', '050'];
  const at   = ['027', '026', '057', '056', '028'];
  if (mtn.includes(pref)) return 'mtn';
  if (tel.includes(pref)) return 'telecel';
  if (at.includes(pref))  return 'at';
  return null;
}

export function fmt(n: number | string): string {
  return '₵' + parseFloat(String(n)).toFixed(2);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
  );
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 3);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function exportCSV(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = `${filename}-${Date.now()}.csv`;
  a.click();
}

export function countUp(
  el: HTMLElement,
  target: number,
  duration = 800,
  prefix = ''
): void {
  const start = 0;
  const increment = target / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = prefix + current.toFixed(2);
  }, 16);
}
