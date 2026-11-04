import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/pdf-attachment.js';
import { Button, Icon, Link } from '@ui5/webcomponents-react';
import type { CSSProperties } from 'react';

import styles from './fiori-pdf-viewer.module.css';

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
    style?: CSSProperties;
    className?: string;
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
export function FioriPdfViewer({ src, title, downloadUrl, onClose, height = 480, style, className }: FioriPdfViewerProps) {
    const resolvedDownloadUrl = downloadUrl ?? src;

    // UI5 Button can't render as an <a download>, so trigger the download via a temporary anchor.
    const download = () => {
        const anchor = document.createElement('a');
        anchor.href = resolvedDownloadUrl;
        anchor.download = title;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.click();
    };

    return (
        <div className={[styles.viewer, className].filter(Boolean).join(' ')} style={style}>
            <div className={styles.toolbar}>
                <div className={styles.title}>
                    <Icon name="pdf-attachment" className={styles.icon} />
                    <span className={styles.titleText} title={title}>
                        {title}
                    </span>
                </div>
                <div className={styles.actions}>
                    <Button design="Transparent" icon="download" tooltip="Download" accessibleName="download pdf" onClick={download} />
                    {onClose && <Button design="Transparent" icon="decline" tooltip="Close" accessibleName="close" onClick={onClose} />}
                </div>
            </div>

            {/* Desktop/tablet: embed the PDF — the browser's own plugin gives paging/zoom/print for free. */}
            <iframe src={src} title={title} className={styles.frame} style={{ height }} />

            {/* Mobile: no inline rendering per the guideline — a download prompt instead. */}
            <div className={styles.mobile}>
                <Icon name="pdf-attachment" className={styles.icon} style={{ width: '2rem', height: '2rem' }} />
                <span>Preview isn't available on this device.</span>
                <Link
                    href={resolvedDownloadUrl}
                    target="_blank"
                    style={{ fontWeight: 600 }}
                    onClick={(e) => {
                        e.preventDefault();
                        download();
                    }}
                >
                    Download to view
                </Link>
            </div>
        </div>
    );
}
