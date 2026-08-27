import { Icon } from '@/components/icon';
import { FIORI } from '@/lib/fiori-style';
import { Box, Dialog, IconButton } from '@mui/material';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * เปิดรูปเต็มจอใน lightbox โดยกดที่ thumbnail ในตาราง list ต่างๆ (Products,
 * Categories, Brands, ...) — ครอบหน้าด้วย <ImagePreviewProvider> หนึ่งครั้ง
 * แล้วใช้ <ClickableThumbnail> หรือ useImagePreview() ที่ไหนก็ได้ข้างใน
 */
const ImagePreviewContext = createContext<(src: string, alt?: string) => void>(() => {});

export function useImagePreview() {
    return useContext(ImagePreviewContext);
}

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
    const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
    const open = useCallback((src: string, alt = '') => setPreview({ src, alt }), []);

    return (
        <ImagePreviewContext.Provider value={open}>
            {children}
            <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md">
                <IconButton
                    onClick={() => setPreview(null)}
                    aria-label="Close"
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1,
                        bgcolor: 'rgba(0,0,0,0.4)',
                        color: '#fff',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                    }}
                >
                    <Icon name="close" fontSize="small" />
                </IconButton>
                {preview && (
                    <Box
                        component="img"
                        src={preview.src}
                        alt={preview.alt}
                        sx={{ display: 'block', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                    />
                )}
            </Dialog>
        </ImagePreviewContext.Provider>
    );
}

/**
 * กรอบ thumbnail สี่เหลี่ยมที่กดเพื่อดูรูปเต็มได้ ถ้าไม่ส่ง `src` มา (ไม่มีรูป)
 * จะ render `fallback` แบบกดไม่ได้แทน
 */
export function ClickableThumbnail({
    src,
    alt = '',
    size = 38,
    radius = 2,
    fallback,
}: {
    src: string | null | undefined;
    alt?: string;
    size?: number;
    radius?: number;
    fallback?: ReactNode;
}) {
    const openPreview = useImagePreview();

    const frameSx = {
        width: size,
        height: size,
        borderRadius: radius,
        border: `1px solid ${FIORI.border}`,
        bgcolor: 'grey.100',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
    } as const;

    if (!src) {
        return <Box sx={frameSx}>{fallback}</Box>;
    }

    return (
        <Box
            role="button"
            tabIndex={0}
            aria-label={alt || 'View image'}
            onClick={(e) => {
                e.stopPropagation();
                openPreview(src, alt);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPreview(src, alt);
                }
            }}
            sx={{
                ...frameSx,
                cursor: 'zoom-in',
                transition: 'box-shadow 0.15s ease',
                '&:hover': { boxShadow: `0 0 0 2px ${FIORI.brand}` },
                '&:focus-visible': { outline: `2px solid ${FIORI.brand}`, outlineOffset: 1 },
            }}
        >
            <Box component="img" src={src} alt={alt} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
    );
}
