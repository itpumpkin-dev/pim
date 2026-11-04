import '@ui5/webcomponents-icons/dist/decline.js';
import { Button, Dialog } from '@ui5/webcomponents-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import styles from './image-preview.module.css';

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
            <Dialog
                open={!!preview}
                onClose={() => setPreview(null)}
                accessibleName={preview?.alt || 'Image preview'}
                style={{ maxWidth: 'min(900px, calc(100vw - 2rem))', padding: 0 }}
            >
                <div style={{ position: 'relative' }}>
                    <Button
                        design="Transparent"
                        icon="decline"
                        tooltip="Close"
                        accessibleName="Close"
                        className={styles.dialogClose}
                        onClick={() => setPreview(null)}
                    />
                    {preview && <img src={preview.src} alt={preview.alt} className={styles.previewImage} />}
                </div>
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
    /** corner radius in 4px steps (kept from the old MUI theme-spacing unit) */
    radius?: number;
    fallback?: ReactNode;
}) {
    const openPreview = useImagePreview();
    const frameStyle = { width: size, height: size, borderRadius: radius * 4 };

    if (!src) {
        return (
            <div className={styles.frame} style={frameStyle}>
                {fallback}
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={alt || 'View image'}
            className={`${styles.frame} ${styles.clickable}`}
            style={frameStyle}
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
        >
            <img src={src} alt={alt} className={styles.thumb} />
        </div>
    );
}
