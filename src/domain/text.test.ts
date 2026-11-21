import { describe, expect, it } from 'vitest';
import { normalizeText } from './text';

describe('normalizeText', () => {
  it('lowercases, trims and removes Vietnamese diacritics', () => {
    expect(normalizeText('  Báo Cáo Đồ Án ')).toBe('bao cao do an');
    expect(normalizeText('Ưu tiên KHẨN')).toBe('uu tien khan');
  });
});
