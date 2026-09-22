import { xsrfToken } from '@/lib/csrf';
import { useCallback, useRef, useState } from 'react';

export interface FileUploadRow {
    id: string;
    name: string;
    progress: number;
    status: 'uploading' | 'error';
    error?: string;
}

interface UploadResult {
    path: string;
    url: string;
}

/**
 * Drives real per-file upload progress for the FioriUploadDropzone (gallery/video/single
 * image/file attribute fields on the product edit form) — uses XMLHttpRequest directly
 * because fetch() has no cross-browser upload-progress event, unlike xhr.upload.onprogress.
 *
 * Each accepted file uploads immediately (before the product form itself is saved), same
 * tradeoff as RichTextEditor's imageUploadUrl: the file lands on disk right away, so it can
 * be orphaned if the user never hits Save. Accepted precedent in this codebase already —
 * see ProductController::uploadDescriptionImage().
 */
export function useFileUploadRows() {
    const [rows, setRows] = useState<FileUploadRow[]>([]);
    const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());

    const removeRow = useCallback((id: string) => {
        xhrsRef.current.get(id)?.abort();
        xhrsRef.current.delete(id);
        setRows((prev) => prev.filter((row) => row.id !== id));
    }, []);

    const upload = useCallback((file: File, url: string, onDone: (result: UploadResult) => void) => {
        const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows((prev) => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }]);

        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhrsRef.current.set(id, xhr);
        xhr.open('POST', url);
        xhr.setRequestHeader('X-XSRF-TOKEN', xsrfToken());
        xhr.setRequestHeader('Accept', 'application/json');

        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const progress = Math.round((e.loaded / e.total) * 100);
            setRows((prev) => prev.map((row) => (row.id === id ? { ...row, progress } : row)));
        };

        const fail = (message: string) => {
            xhrsRef.current.delete(id);
            setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status: 'error', progress: 100, error: message } : row)));
        };

        xhr.onload = () => {
            xhrsRef.current.delete(id);
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText) as UploadResult;
                    setRows((prev) => prev.filter((row) => row.id !== id));
                    onDone(data);
                } catch {
                    fail('Upload failed.');
                }
                return;
            }

            try {
                const data = JSON.parse(xhr.responseText) as { message?: string; errors?: Record<string, string[]> };
                const firstError = data.errors ? Object.values(data.errors)[0]?.[0] : undefined;
                fail(firstError || data.message || 'Upload failed.');
            } catch {
                fail('Upload failed.');
            }
        };

        xhr.onerror = () => fail('Upload failed — network error.');
        // Fires on removeRow()'s xhr.abort(); the row is already gone from state by then.
        xhr.onabort = () => xhrsRef.current.delete(id);

        xhr.send(formData);
    }, []);

    return { rows, upload, removeRow };
}
