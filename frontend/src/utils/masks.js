const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

export const maskPhone = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const maskPhoneIntl = (v) => {
  const d = onlyDigits(v).slice(0, 13);
  if (!d) return '';
  if (d.length <= 2) return `+${d}`;
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
  if (d.length <= 8) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
  if (d.length <= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
};

export const maskCpf = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

export const maskCnpj = (v) => {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

export const maskCpfCnpj = (v) => {
  const d = onlyDigits(v);
  return d.length <= 11 ? maskCpf(v) : maskCnpj(v);
};

export const maskCep = (v) => {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

export const maskState = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);

export const maskCurrencyBRL = (v) => {
  const d = onlyDigits(v);
  if (!d) return '';
  const n = Number(d) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const parseCurrencyBRL = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const d = onlyDigits(v);
  if (!d) return '';
  return (Number(d) / 100).toFixed(2);
};

export const formatCurrencyBRL = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const numberToCurrencyInput = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const maskPercent = (v) => {
  const s = String(v ?? '').replace(/[^\d,.]/g, '').replace(',', '.');
  const parts = s.split('.');
  if (parts.length > 2) return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
  if (parts[1]) return `${parts[0]}.${parts[1].slice(0, 2)}`;
  return s;
};

export const maskInteger = (v) => onlyDigits(v);

export const maskDateBR = (v) => {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

export const formatDateBR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
};

export const formatDateTimeBR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export { onlyDigits };
