import { describe, it, expect } from 'vitest';
import { parseOFX, parseOFXDate, parseOFXAmount } from './ofx';

describe('parseOFXDate', () => {
  it('YYYYMMDD', () => {
    expect(parseOFXDate('20260509')).toBe('2026-05-09');
  });

  it('YYYYMMDDHHMMSS', () => {
    expect(parseOFXDate('20260509143000')).toBe('2026-05-09');
  });

  it('com timezone offset', () => {
    expect(parseOFXDate('20260509120000[-3:BRT]')).toBe('2026-05-09');
  });

  it('vazio → null', () => {
    expect(parseOFXDate(null)).toBe(null);
    expect(parseOFXDate('')).toBe(null);
  });
});

describe('parseOFXAmount', () => {
  it('positivo', () => {
    expect(parseOFXAmount('1234.56')).toBe(123456);
  });

  it('negativo', () => {
    expect(parseOFXAmount('-1234.56')).toBe(-123456);
  });

  it('inteiro', () => {
    expect(parseOFXAmount('100')).toBe(10000);
  });
});

describe('parseOFX', () => {
  it('arquivo OFX completo simples', () => {
    const content = `OFXHEADER:100
DATA:OFXSGML

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260509</DTPOSTED>
<TRNAMT>-50.00</TRNAMT>
<FITID>123</FITID>
<MEMO>UBER TRIP</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260510</DTPOSTED>
<TRNAMT>500.00</TRNAMT>
<FITID>124</FITID>
<MEMO>SALARIO</MEMO>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
    const result = parseOFX(content);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2026-05-09',
      description: 'UBER TRIP',
      amountCents: -5000,
    });
    expect(result[1]).toEqual({
      date: '2026-05-10',
      description: 'SALARIO',
      amountCents: 50000,
    });
  });

  it('usa <NAME> quando <MEMO> não existe', () => {
    const content = `<OFX><STMTTRN>
<DTPOSTED>20260509</DTPOSTED>
<TRNAMT>-50.00</TRNAMT>
<NAME>Pão de Açúcar</NAME>
</STMTTRN></OFX>`;
    const result = parseOFX(content);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Pão de Açúcar');
  });

  it('STMTTRN sem campo obrigatório é pulado', () => {
    const content = `<STMTTRN>
<DTPOSTED>20260509</DTPOSTED>
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260510</DTPOSTED>
<TRNAMT>100.00</TRNAMT>
<MEMO>OK</MEMO>
</STMTTRN>`;
    const result = parseOFX(content);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('OK');
  });

  it('arquivo sem STMTTRN → array vazio', () => {
    expect(parseOFX('<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>')).toEqual([]);
    expect(parseOFX('not even ofx')).toEqual([]);
  });
});
