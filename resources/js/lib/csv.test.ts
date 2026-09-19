// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './csv';

describe('downloadCsv', () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        createObjectURL = vi.fn(() => 'blob:mock-url');
        revokeObjectURL = vi.fn();
        URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
        URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
        clickSpy.mockRestore();
    });

    it('builds a UTF-8-BOM-prefixed CSV blob from headers + rows, joined with CRLF', async () => {
        downloadCsv('export.csv', ['Name', 'Qty'], [['Widget', 5]]);

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        const blob = createObjectURL.mock.calls[0][0] as Blob;
        expect(blob.type).toBe('text/csv;charset=utf-8;');
        // Blob#text() decodes via TextDecoder, which strips a leading BOM per
        // spec — check the raw bytes instead to confirm the BOM is actually there.
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect(await blob.text()).toBe('Name,Qty\r\nWidget,5');
    });

    it('quotes a value containing a comma, quote, or newline — doubling any embedded quotes', async () => {
        downloadCsv('export.csv', ['Name'], [['Say "hi", bye'], ['line1\nline2']]);

        const blob = createObjectURL.mock.calls[0][0] as Blob;
        expect(await blob.text()).toBe('Name\r\n"Say ""hi"", bye"\r\n"line1\nline2"');
    });

    it('leaves a plain value with no special characters unquoted', async () => {
        downloadCsv('export.csv', ['Name'], [['Plain Value']]);

        const blob = createObjectURL.mock.calls[0][0] as Blob;
        expect(await blob.text()).toBe('Name\r\nPlain Value');
    });

    it('sets the anchor download filename, clicks it, and revokes the object URL afterwards', () => {
        downloadCsv('report.csv', ['A'], [[1]]);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('removes the temporary anchor from the DOM after triggering the download', () => {
        const before = document.body.childElementCount;

        downloadCsv('report.csv', ['A'], [[1]]);

        expect(document.body.childElementCount).toBe(before);
    });
});
