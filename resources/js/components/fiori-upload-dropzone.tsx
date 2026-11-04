import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/upload-to-cloud.js';
import { Button, Icon, ProgressIndicator } from '@ui5/webcomponents-react';
import { useRef, useState, type DragEvent } from 'react';

import styles from './fiori-upload-dropzone.module.css';

export interface UploadDropzoneRow {
    id: string;
    name: string;
    progress: number;
    status: 'uploading' | 'error';
    error?: string;
}

interface FioriUploadDropzoneTileProps {
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    width?: number;
    height?: number;
    /** Short label under the icon, e.g. "Upload" — the tile is sized to sit inline with thumbnails, so there's no room for a full sentence. */
    label: string;
    /** Tints the border/icon red without rendering the message itself — pair with a FileUploadRowsList underneath for the actual text. */
    hasError?: boolean;
    onFilesSelected: (files: File[]) => void;
}

/**
 * Compact square drop target meant to sit inline with a row of thumbnails (GalleryThumb,
 * VideoThumb, an image preview, ...) as the row's trailing "add" tile — rather than the
 * full-width panel a standalone uploader would use. Drag/drop + click-to-browse both open
 * the same file picker; render a FileUploadRowsList alongside for progress/error detail.
 */
export function FioriUploadDropzoneTile({
    accept,
    multiple = false,
    disabled,
    width = 200,
    height = 200,
    label,
    hasError,
    onFilesSelected,
}: FioriUploadDropzoneTileProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const openPicker = () => {
        if (!disabled) inputRef.current?.click();
    };

    const handleList = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        onFilesSelected(multiple ? Array.from(list) : [list[0]]);
    };

    const tileClass = [styles.tile, dragging ? styles.dragging : hasError ? styles.error : '', disabled ? styles.disabled : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            className={tileClass}
            style={{ width, height }}
            onClick={openPicker}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPicker();
                }
            }}
            onDragOver={(e: DragEvent<HTMLElement>) => {
                e.preventDefault();
                if (!disabled) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent<HTMLElement>) => {
                e.preventDefault();
                setDragging(false);
                if (!disabled) handleList(e.dataTransfer.files);
            }}
        >
            <Icon name="upload-to-cloud" className={[styles.icon, hasError ? styles.iconError : ''].filter(Boolean).join(' ')} />
            <span className={styles.label}>{label}</span>
            <input
                ref={inputRef}
                type="file"
                hidden
                accept={accept}
                multiple={multiple}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                    handleList(e.target.files);
                    e.target.value = '';
                }}
            />
        </div>
    );
}

interface FileUploadRowsListProps {
    /** Top-level banner, e.g. "maximum reached" / dimension errors that reject the pick before any upload starts. */
    error?: string;
    /** In-flight/failed uploads only — completed files are expected to be rendered by the caller (thumbnails, tokens, ...). */
    rows: UploadDropzoneRow[];
    percentLabel: (percent: number) => string;
    onRemoveRow: (id: string) => void;
}

/** The error banner + per-file progress rows that go underneath a row of thumbnails + FioriUploadDropzoneTile. */
export function FileUploadRowsList({ error, rows, percentLabel, onRemoveRow }: FileUploadRowsListProps) {
    if (!error && rows.length === 0) return null;

    return (
        <div className={styles.rows}>
            {error && <span className={styles.errorText}>{error}</span>}
            {rows.length > 0 && (
                <div className={styles.rowList} style={{ marginTop: error ? '0.5rem' : 0 }}>
                    {rows.map((row) => (
                        <div key={row.id} className={styles.row}>
                            <div className={styles.rowHeader}>
                                <span className={styles.rowName} title={row.name}>
                                    {row.name}
                                </span>
                                <Button
                                    design="Transparent"
                                    icon="decline"
                                    accessibleName="remove file"
                                    tooltip="Remove"
                                    onClick={() => onRemoveRow(row.id)}
                                />
                            </div>
                            {row.status === 'error' ? (
                                <span className={styles.errorText}>{row.error}</span>
                            ) : (
                                <ProgressIndicator
                                    value={row.progress}
                                    valueState="Positive"
                                    displayValue={percentLabel(row.progress)}
                                    style={{ marginTop: '0.25rem', width: '100%' }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
