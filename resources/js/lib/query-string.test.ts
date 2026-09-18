import { describe, expect, test } from 'vitest';
import { encodeQueryParams } from './query-string';

describe('encodeQueryParams', () => {
    test('encodes flat params as key=value pairs', () => {
        expect(encodeQueryParams({ sku: 'ABC-1', qty: 5 })).toEqual(['sku=ABC-1', 'qty=5']);
    });

    test('encodes nested objects using bracket notation with the parent key as prefix', () => {
        expect(encodeQueryParams({ filters: { created_at: { from: '2026-01-01', to: '2026-01-31' } } })).toEqual([
            'filters%5Bcreated_at%5D%5Bfrom%5D=2026-01-01',
            'filters%5Bcreated_at%5D%5Bto%5D=2026-01-31',
        ]);
    });

    test('URL-encodes both keys and values', () => {
        expect(encodeQueryParams({ 'a b': 'c&d' })).toEqual(['a%20b=c%26d']);
    });

    test('skips keys whose value is undefined, null, or an empty string', () => {
        expect(encodeQueryParams({ a: undefined, b: null, c: '', d: 'kept' })).toEqual(['d=kept']);
    });

    test('a value of 0 or false is kept, not treated as empty', () => {
        expect(encodeQueryParams({ qty: 0, enabled: false })).toEqual(['qty=0', 'enabled=false']);
    });

    test('an array value is stringified as a whole, not recursed into per-index', () => {
        expect(encodeQueryParams({ ids: [1, 2, 3] })).toEqual([`ids=${encodeURIComponent('1,2,3')}`]);
    });

    test('an empty object at any level contributes no parts', () => {
        expect(encodeQueryParams({ filters: {}, sku: 'ABC' })).toEqual(['sku=ABC']);
    });

    test('an empty top-level object encodes to an empty array', () => {
        expect(encodeQueryParams({})).toEqual([]);
    });

    test('a nested object skips its own undefined/null/empty leaves the same way the top level does', () => {
        expect(encodeQueryParams({ filters: { from: undefined, to: '2026-01-31' } })).toEqual(['filters%5Bto%5D=2026-01-31']);
    });

    test('deeply nested objects recurse through every level, building up the prefix each time', () => {
        expect(encodeQueryParams({ a: { b: { c: { d: 'x' } } } })).toEqual(['a%5Bb%5D%5Bc%5D%5Bd%5D=x']);
    });
});
