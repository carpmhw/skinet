import { TwdPricePipe } from './twd-price.pipe';

describe('TwdPricePipe', () => {
  const pipe = new TwdPricePipe();

  it('formats whole prices without decimals or currency ambiguity', () => {
    expect(pipe.transform(200)).toBe('NT$200');
  });

  it('keeps meaningful decimals and thousands separators', () => {
    expect(pipe.transform(1200.5)).toBe('NT$1,200.5');
    expect(pipe.transform(8.25)).toBe('NT$8.25');
    expect(pipe.transform(1234567.89)).toBe('NT$1,234,567.89');
  });

  it('prints a real zero instead of hiding it', () => {
    expect(pipe.transform(0)).toBe('NT$0');
  });
});
