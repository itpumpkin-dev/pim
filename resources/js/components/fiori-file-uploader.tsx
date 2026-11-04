import '@ui5/webcomponents-icons/dist/attachment.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import { Button } from '@ui5/webcomponents-react';
import { useRef, useState, type DragEvent } from 'react';

import styles from './fiori-file-uploader.module.css';

interface FioriFileUploaderProps {
    placeholder: string;
    accept?: string;
    multiple?: boolean;
    error?: string;
    disabled?: boolean;

    /**
     * Controlled mode — this component owns the File[] list, renders a
     * removable token per file, and reports the whole list back.
     */
    files?: File[];
    onFilesChange?: (files: File[]) => void;

    /**
     * Callback mode — the caller keeps ownership of the value (it may run its
     * own validation, mix in an already-uploaded path, manage a thumbnail
     * grid, …). This component only renders the Fiori field shell and hands
     * back the raw FileList on pick/drop. Pass `valueLabel` for the token to
     * show as the current selection, and `onClear` to offer a remove button.
     */
    onSelect?: (files: FileList) => void;
    valueLabel?: string | null;
    onClear?: () => void;
}

/**
 * Single-line "Browse or drop a file" field matching SAP Fiori's File
 * Uploader UI element: a bordered input-shaped box with a placeholder, a
 * removable token for the selection, and a browse icon docked at the right
 * edge — instead of a separate "Choose File" button + plain filename text.
 * https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/file-uploader
 */
export function FioriFileUploader({
    files,
    onFilesChange,
    placeholder,
    accept,
    multiple = false,
    error,
    disabled,
    onSelect,
    valueLabel,
    onClear,
}: FioriFileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const controlled = typeof onFilesChange === 'function';

    const handleList = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        if (controlled) {
            const incoming = Array.from(list);
            onFilesChange!(multiple ? [...(files ?? []), ...incoming] : [incoming[0]]);
        } else {
            onSelect?.(list);
        }
    };

    const removeFile = (index: number) => onFilesChange?.((files ?? []).filter((_, i) => i !== index));

    // token(s) to render on the left: the managed File[] in controlled mode,
    // or the single caller-supplied label in callback mode
    const tokens: Array<{ key: string; label: string; onRemove?: () => void }> = controlled
        ? (files ?? []).map((file, index) => ({
              key: `${file.name}-${index}`,
              label: file.name,
              onRemove: disabled ? undefined : () => removeFile(index),
          }))
        : valueLabel
          ? [{ key: 'value', label: valueLabel, onRemove: !disabled && onClear ? onClear : undefined }]
          : [];

    const fieldClass = [styles.field, dragging ? styles.dragging : error ? styles.error : '', disabled ? styles.disabled : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div>
            <div
                className={fieldClass}
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
                <div className={styles.tokens}>
                    {tokens.length === 0 && <span className={styles.placeholder}>{placeholder}</span>}
                    {tokens.map((token) => (
                        <span key={token.key} className={[styles.token, token.onRemove ? styles.tokenRemovable : ''].filter(Boolean).join(' ')}>
                            <span className={styles.tokenLabel} title={token.label}>
                                {token.label}
                            </span>
                            {token.onRemove && (
                                <Button
                                    design="Transparent"
                                    icon="decline"
                                    accessibleName="remove file"
                                    tooltip="Remove"
                                    onClick={token.onRemove}
                                    style={{ minWidth: '1.5rem', width: '1.5rem', height: '1.5rem' }}
                                />
                            )}
                        </span>
                    ))}
                </div>

                {controlled && (files ?? []).length > 0 && !disabled && (
                    <Button
                        design="Transparent"
                        icon="decline"
                        accessibleName="remove all files"
                        tooltip="Remove all"
                        onClick={() => onFilesChange?.([])}
                    />
                )}
                <Button
                    design="Transparent"
                    icon="attachment"
                    accessibleName="browse files"
                    tooltip="Browse"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                />
                <input
                    ref={inputRef}
                    type="file"
                    hidden
                    accept={accept}
                    multiple={multiple}
                    onChange={(e) => {
                        handleList(e.target.files);
                        e.target.value = '';
                    }}
                />
            </div>
            {error && <span className={styles.errorText}>{error}</span>}
        </div>
    );
}
