import { FIORI } from '@/lib/fiori-style';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { Box, FormHelperText, IconButton, Stack, Typography } from '@mui/material';
import { useRef, useState, type DragEvent } from 'react';

interface FioriFileUploaderProps {
    files: File[];
    onFilesChange: (files: File[]) => void;
    placeholder: string;
    accept?: string;
    multiple?: boolean;
    error?: string;
    disabled?: boolean;
}

/**
 * Single-line "Browse or drop a file" field matching SAP Fiori's File
 * Uploader UI element: a bordered input-shaped box with a placeholder, a
 * removable token per selected file, and a browse icon docked at the right
 * edge — instead of a separate "Choose File" button + plain filename text.
 * https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/file-uploader
 */
export function FioriFileUploader({ files, onFilesChange, placeholder, accept, multiple = false, error, disabled }: FioriFileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const addFiles = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        const incoming = Array.from(list);
        onFilesChange(multiple ? [...files, ...incoming] : [incoming[0]]);
    };

    const removeFile = (index: number) => onFilesChange(files.filter((_, i) => i !== index));

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
                    if (!disabled) addFiles(e.dataTransfer.files);
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
                    borderColor: dragging ? FIORI.brand : error ? FIORI.error : FIORI.border,
                    borderRadius: '8px',
                    bgcolor: dragging ? FIORI.selected : FIORI.surface,
                    opacity: disabled ? 0.6 : 1,
                    transition: 'border-color 0.15s, background-color 0.15s',
                }}
            >
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ flex: 1, minWidth: 0, rowGap: 0.5, py: 0.25 }}>
                    {files.length === 0 && (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {placeholder}
                        </Typography>
                    )}
                    {files.map((file, index) => (
                        <Stack
                            key={`${file.name}-${index}`}
                            direction="row"
                            alignItems="center"
                            spacing={0.5}
                            sx={{
                                bgcolor: FIORI.hover,
                                border: `1px solid ${FIORI.border}`,
                                borderRadius: '6px',
                                pl: 1,
                                pr: 0.25,
                                py: 0.25,
                                maxWidth: '100%',
                            }}
                        >
                            <Typography variant="caption" noWrap sx={{ color: FIORI.textPrimary, maxWidth: 240 }}>
                                {file.name}
                            </Typography>
                            {!disabled && (
                                <IconButton size="small" onClick={() => removeFile(index)} sx={{ p: 0.25, color: FIORI.textSecondary }} aria-label="remove file">
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            )}
                        </Stack>
                    ))}
                </Stack>

                {files.length > 0 && !disabled && (
                    <IconButton size="small" onClick={() => onFilesChange([])} sx={{ color: FIORI.textSecondary }} aria-label="remove all files" title="Remove all">
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
                        addFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </Box>
    );
}
