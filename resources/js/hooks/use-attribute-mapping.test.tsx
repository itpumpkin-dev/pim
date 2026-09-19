// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttributeMapping, type MappingAttributeRow } from './use-attribute-mapping';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    router: { post: postMock },
}));

const ROWS: MappingAttributeRow[] = [
    { id: 1, code: 'pname', label: 'Name', type: 'text', target_field: 'name', custom_id: null, sort_order: 0 },
    { id: 2, code: 'pweight', label: 'Weight', type: 'text', target_field: null, custom_id: null, sort_order: 0 },
];

function setup(overrides: Partial<Parameters<typeof useAttributeMapping>[0]> = {}) {
    const buildSavePayload = vi.fn((entry) => ({ ...entry, custom_field_name: entry.custom_id }));

    return renderHook(() =>
        useAttributeMapping({
            attributes: ROWS,
            saveUrl: '/mapping/save',
            syncUrl: '/mapping/sync',
            buildSavePayload,
            ...overrides,
        }),
    );
}

beforeEach(() => {
    postMock.mockReset();
});

describe('useAttributeMapping', () => {
    describe('filtering', () => {
        it('defaults to showing only mapped rows', () => {
            const { result } = setup();

            expect(result.current.filtered.map((r) => r.id)).toEqual([1]);
        });

        it('shows only unmapped rows when status is "unmapped"', () => {
            const { result } = setup();
            act(() => result.current.setStatus('unmapped'));

            expect(result.current.filtered.map((r) => r.id)).toEqual([2]);
        });

        it('shows everything when status is "all"', () => {
            const { result } = setup();
            act(() => result.current.setStatus('all'));

            expect(result.current.filtered.map((r) => r.id)).toEqual([1, 2]);
        });

        it('filters by search text against code or label, case-insensitively', () => {
            const { result } = setup();
            act(() => result.current.setStatus('all'));
            act(() => result.current.setSearch('WEIGHT'));

            expect(result.current.filtered.map((r) => r.id)).toEqual([2]);
        });
    });

    describe('pending edits', () => {
        it('isMapped reflects the pending edit once one is staged, not just the original row', () => {
            const { result } = setup();

            act(() => result.current.setEntry(ROWS[1], { target_field: 'name', custom_id: null }));

            expect(result.current.isMapped(ROWS[1])).toBe(true);
            expect(result.current.hasPendingChange(ROWS[1])).toBe(true);
            expect(result.current.pendingCount).toBe(1);
        });

        it('setSortOrder stages just the sort_order field, keeping the rest of valueFor() intact', () => {
            const { result } = setup();

            act(() => result.current.setSortOrder(ROWS[0], 5));

            expect(result.current.valueFor(ROWS[0])).toEqual({ target_field: 'name', custom_id: null, sort_order: 5 });
        });
    });

    describe('saveChanges', () => {
        it('does nothing (no POST) when there are no pending edits', () => {
            const { result } = setup();

            act(() => result.current.saveChanges());

            expect(postMock).not.toHaveBeenCalled();
        });

        it('POSTs every pending edit through buildSavePayload, then clears pending on success', () => {
            const { result } = setup();
            act(() => result.current.setEntry(ROWS[1], { target_field: 'name', custom_id: null }));

            act(() => result.current.saveChanges());

            expect(postMock).toHaveBeenCalledTimes(1);
            const [url, body, options] = postMock.mock.calls[0];
            expect(url).toBe('/mapping/save');
            expect(body.mappings).toEqual([{ attribute_id: 2, target_field: 'name', custom_id: null, sort_order: 0, custom_field_name: null }]);

            expect(result.current.saving).toBe(true);
            act(() => options.onSuccess());
            expect(result.current.pendingCount).toBe(0);
            act(() => options.onFinish());
            expect(result.current.saving).toBe(false);
        });
    });

    describe('syncFromPlatform', () => {
        it('POSTs to syncUrl and toggles `syncing`', () => {
            const { result } = setup();

            act(() => result.current.syncFromPlatform());

            expect(postMock).toHaveBeenCalledWith('/mapping/sync', {}, expect.objectContaining({ preserveScroll: true }));
            expect(result.current.syncing).toBe(true);

            const options = postMock.mock.calls[0][2];
            act(() => options.onFinish());
            expect(result.current.syncing).toBe(false);
        });
    });
});
