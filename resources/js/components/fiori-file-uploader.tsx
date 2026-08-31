import { FIORI } from '@/lib/fiori-style';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { Box, FormHelperText, IconButton, Stack, Typography } from '@mui/material';
import { useRef, useState, type DragEvent } from 'react';

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

    return (
        <Box>
            <Box
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
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    minHeight: 40,
                    pl: 1.25,
                    pr: 0.5,
                    py: 0.5,
                    border: '1px solid',
                    borderColor: dragging ? FIORI.brand : error ? FIORI.error : FIORI.borderStrong,
                    borderRadius: '0.375rem',
                    bgcolor: dragging ? FIORI.selected : error ? FIORI.errorBg : FIORI.surface,
                    opacity: disabled ? 0.6 : 1,
                    transition: 'border-color 0.15s, background-color 0.15s',
                    '&:hover': disabled ? undefined : { borderColor: FIORI.brand },
                }}
            >
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ flex: 1, minWidth: 0, rowGap: 0.5, py: 0.25 }}>
                    {tokens.length === 0 && (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {placeholder}
                        </Typography>
                    )}
                    {tokens.map((token) => (
                        <Stack
                            key={token.key}
                            direction="row"
                            alignItems="center"
                            spacing={0.5}
                            sx={{
                                bgcolor: FIORI.hover,
                                border: `1px solid ${FIORI.border}`,
                                borderRadius: '0.25rem',
                                pl: 1,
                                pr: token.onRemove ? 0.25 : 1,
                                py: 0.25,
                                maxWidth: '100%',
                            }}
                        >
                            <Typography variant="caption" noWrap sx={{ color: FIORI.textPrimary, maxWidth: 240 }}>
                                {token.label}
                            </Typography>
                            {token.onRemove && (
                                <IconButton size="small" onClick={token.onRemove} sx={{ p: 0.25, color: FIORI.textSecondary }} aria-label="remove file">
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            )}
                        </Stack>
                    ))}
                </Stack>

                {controlled && (files ?? []).length > 0 && !disabled && (
                    <IconButton size="small" onClick={() => onFilesChange?.([])} sx={{ color: FIORI.textSecondary }} aria-label="remove all files" title="Remove all">
                        <CloseIcon fontSize="small" />
                    </IconButton>
                )}
                <IconButton
                    size="small"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled}
                    sx={{ color: FIORI.textSecondary }}
                    aria-label="browse files"
                >
                    <AttachFileIcon fontSize="small" />
                </IconButton>
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
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </Box>
    );
}
