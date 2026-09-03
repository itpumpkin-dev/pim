import { FIORI, fioriCardSx } from '@/lib/fiori-style';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { Box, IconButton, Paper, Stack, Typography, type SxProps, type Theme } from '@mui/material';

interface FioriPdfViewerProps {
    /** URL (server path or a local `URL.createObjectURL(file)` blob) the embedded frame loads. */
    src: string;
    /** Filename/title shown in the toolbar — also used as the suggested download filename. */
    title: string;
    /** Separate URL to download from, if different from `src` (e.g. `src` is a short-lived preview blob). Defaults to `src`. */
    downloadUrl?: string;
    /** Shows a trailing Close button — pass this when the viewer sits inside a Dialog. */
    onClose?: () => void;
    /** Height of the embedded frame on tablet/desktop. Default 480. */
    height?: number | string;
    sx?: SxProps<Theme>;
}

/**
 * SAP Fiori "PDF Viewer" — displays a PDF inline (embedded in the page
 * layout, not necessarily a popup dialog — both are valid per the
 * guideline) with a toolbar carrying the document's title and a Download
 * action, plus a Close action when used inside a Dialog. Paging, scrolling,
 * zooming and print are left to the browser's own PDF renderer inside the
 * embedded frame rather than reimplemented here — this is how sap.m.PDFViewer
 * itself works under the hood, and it's what keeps those interactions
 * consistent with whatever native PDF viewer the browser already has.
 *
 * On narrow (mobile) viewports the guideline says not to render the PDF
 * inline at all — only the toolbar + a way to download it — since embedded
 * PDF rendering on phone browsers is unreliable; this component follows
 * that split via CSS breakpoints rather than a JS device check.
 *
 * The ≥1rem gap from surrounding content the guideline calls for is the
 * caller's responsibility (e.g. wrap this in a `FioriFormGroup`, or give it
 * margin) — this component only owns its own border/padding.
 *
 * ref: sap.com/design-system/fiori-design-web → UI elements → PDF Viewer
 */
export function FioriPdfViewer({ src, title, downloadUrl, onClose, height = 480, sx }: FioriPdfViewerProps) {
    const resolvedDownloadUrl = downloadUrl ?? src;

    return (
        <Paper elevation={0} sx={[fioriCardSx, { overflow: 'hidden' }, sx] as SxProps<Theme>}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1, borderBottom: `1px solid ${FIORI.border}`, bgcolor: FIORI.headerBg, gap: 1 }}
            >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: FIORI.textSecondary, flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ color: FIORI.textPrimary, fontWeight: 600 }}>
                        {title}
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton
                        component="a"
                        href={resolvedDownloadUrl}
                        download={title}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="small"
                        title="Download"
                        aria-label="download pdf"
                        sx={{ color: FIORI.textSecondary, '&:hover': { color: FIORI.brand } }}
                    >
                        <DownloadIcon fontSize="small" />
                    </IconButton>
                    {onClose && (
                        <IconButton size="small" onClick={onClose} aria-label="close" sx={{ color: FIORI.textSecondary, '&:hover': { color: FIORI.error } }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
            </Stack>

            {/* Desktop/tablet: embed the PDF — the browser's own plugin gives paging/zoom/print for free. */}
            <Box
                component="iframe"
                src={src}
                title={title}
                sx={{ display: { xs: 'none', sm: 'block' }, width: '100%', height, border: 0, bgcolor: FIORI.surface }}
            />

            {/* Mobile: no inline rendering per the guideline — a download prompt instead. */}
            <Stack
                spacing={1}
                alignItems="center"
                justifyContent="center"
                sx={{ display: { xs: 'flex', sm: 'none' }, py: 4, px: 2 }}
            >
                <PictureAsPdfOutlinedIcon sx={{ fontSize: 32, color: FIORI.textSecondary }} />
                <Typography variant="body2" sx={{ color: FIORI.textSecondary, textAlign: 'center' }}>
                    Preview isn't available on this device.
                </Typography>
                <Typography
                    component="a"
                    href={resolvedDownloadUrl}
                    download={title}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    sx={{ color: FIORI.brand, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                    Download to view
                </Typography>
            </Stack>
        </Paper>
    );
}
