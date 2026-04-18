import {
  maskPhone,
  maskPhoneIntl,
  maskCpf,
  maskCnpj,
  maskCpfCnpj,
  maskCep,
  maskState,
  maskCurrencyBRL,
  parseCurrencyBRL,
  numberToCurrencyInput,
  maskPercent,
  maskInteger,
  maskDateBR,
} from '../utils/masks';

const MASKS = {
  phone: maskPhone,
  phoneIntl: maskPhoneIntl,
  cpf: maskCpf,
  cnpj: maskCnpj,
  cpfCnpj: maskCpfCnpj,
  cep: maskCep,
  state: maskState,
  percent: maskPercent,
  integer: maskInteger,
  dateBR: maskDateBR,
};

export default function MaskedInput({ mask, value, onChange, onValueChange, ...rest }) {
  if (mask === 'currency') {
    const display = value === '' || value === null || value === undefined
      ? ''
      : numberToCurrencyInput(value);
    return (
      <input
        {...rest}
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          const masked = maskCurrencyBRL(raw);
          const parsed = parseCurrencyBRL(raw);
          if (onChange) onChange({ ...e, target: { ...e.target, value: parsed, name: rest.name } });
          if (onValueChange) onValueChange(parsed);
          e.target.value = masked;
        }}
      />
    );
  }

  const fn = MASKS[mask];
  return (
    <input
      {...rest}
      value={value ?? ''}
      onChange={(e) => {
        const v = fn ? fn(e.target.value) : e.target.value;
        if (onChange) onChange({ ...e, target: { ...e.target, value: v, name: rest.name } });
        if (onValueChange) onValueChange(v);
      }}
    />
  );
}
