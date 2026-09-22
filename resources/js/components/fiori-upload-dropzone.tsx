import { FIORI } from '@/lib/fiori-style';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { Box, FormHelperText, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import { useRef, useState, type DragEvent } from 'react';

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

    return (
        <Box
            onClick={openPicker}
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
                width,
                height,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                border: '2px dashed',
                borderColor: dragging ? FIORI.brand : hasError ? FIORI.error : FIORI.borderStrong,
                borderRadius: 1,
                bgcolor: dragging ? FIORI.selected : FIORI.surface,
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': disabled ? undefined : { borderColor: FIORI.brand },
            }}
        >
            <CloudUploadOutlinedIcon sx={{ fontSize: 28, color: hasError ? FIORI.error : FIORI.textSecondary }} />
            <Typography variant="caption" sx={{ color: FIORI.brand, fontWeight: 600 }}>
                {label}
            </Typography>
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
        <Box sx={{ mt: 1 }}>
            {error && <FormHelperText error>{error}</FormHelperText>}
            {rows.length > 0 && (
                <Stack spacing={1} sx={{ mt: error ? 1 : 0 }}>
                    {rows.map((row) => (
                        <Box key={row.id} sx={{ border: `1px solid ${FIORI.border}`, borderRadius: '0.375rem', px: 1.5, py: 1, maxWidth: 420 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                <Typography variant="body2" noWrap sx={{ color: FIORI.textPrimary, flex: 1, minWidth: 0 }}>
                                    {row.name}
                                </Typography>
                                <IconButton
                                    size="small"
                                    onClick={() => onRemoveRow(row.id)}
                                    sx={{ p: 0.25, color: FIORI.error }}
                                    aria-label="remove file"
                                >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Stack>
                            {row.status === 'error' ? (
                                <Typography variant="caption" sx={{ color: FIORI.error }}>
                                    {row.error}
                                </Typography>
                            ) : (
                                <Box sx={{ mt: 0.5 }}>
                                    <LinearProgress
                                        variant="determinate"
                                        value={row.progress}
                                        sx={{
                                            height: 6,
                                            borderRadius: 3,
                                            bgcolor: FIORI.hover,
                                            '& .MuiLinearProgress-bar': { bgcolor: FIORI.success, borderRadius: 3 },
                                        }}
                                    />
                                    <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: FIORI.textSecondary, mt: 0.25 }}>
                                        {percentLabel(row.progress)}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
