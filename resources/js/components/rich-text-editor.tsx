import { xsrfToken } from '@/lib/csrf';
import { FIORI } from '@/lib/fiori-style';
import { Box, type SxProps, type Theme } from '@mui/material';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import 'react-quill-new/dist/quill.snow.css';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    /** เมื่อกำหนดไว้ ปุ่มแทรกรูปภาพจะ POST ไฟล์ไปที่ URL นี้ (multipart, field
     *  ชื่อ `image`) แล้วแทรก URL ที่ตอบกลับมา (`{ url: string }`) เข้าเนื้อหา
     *  ทันที — ไม่กำหนดไว้แปลว่าซ่อนปุ่มรูปภาพไป (เช่นตอนที่ยังไม่มี product id
     *  ให้ผูก endpoint ด้วย) */
    imageUploadUrl?: string;
    /** 'error' วาดกรอบ + พื้นแบบ value-state แดง ให้เข้าชุดกับ fioriFieldStateSx */
    valueState?: 'none' | 'error';
}

/**
 * SAP Fiori (Horizon) "Rich Text Editor" look for the Quill snow theme.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Rich Text Editor
 *
 *  - one bordered control (Fiori field border, 0.375rem corners, surface bg)
 *  - toolbar = flat strip with a bottom hairline only, grouped icon buttons
 *    (2rem, subtle hover, brand-tinted when active)
 *  - editor area = Fiori type ramp, comfortable padding, muted placeholder
 *  - focus moves the whole control's border to the brand colour
 *  - valueState="error" → 2px error border + light error tint (matches
 *    fioriFieldStateSx so a rich-text field reads the same as every other)
 */
function fioriQuillSx(valueState: 'none' | 'error', readOnly: boolean): SxProps<Theme> {
    const border = valueState === 'error' ? FIORI.error : FIORI.borderStrong;
    const borderWidth = valueState === 'error' ? '2px' : '1px';

    return {
        borderRadius: '0.375rem',
        border: `${borderWidth} solid ${border}`,
        bgcolor: valueState === 'error' ? FIORI.errorBg : FIORI.surface,
        overflow: 'hidden',
        transition: 'border-color 0.1s ease',
        '&:focus-within': {
            borderColor: FIORI.brand,
        },

        // Quill draws its own borders on toolbar/container — drop them, the
        // wrapper above owns the outline now.
        '& .ql-toolbar.ql-snow, & .ql-container.ql-snow': {
            border: 'none',
        },
        // Keep Quill's own float/inline-block toolbar layout — overriding it
        // with flex is what made the groups collide. Only restyle the chrome.
        '& .ql-toolbar.ql-snow': {
            borderBottom: `1px solid ${FIORI.border}`,
            bgcolor: FIORI.headerBg,
            padding: '5px 8px',
            fontFamily: 'inherit',
        },
        // groups of formats — a thin rule between them, Fiori toolbar rhythm
        '& .ql-toolbar.ql-snow .ql-formats': {
            marginRight: '8px',
            paddingRight: '8px',
            borderRight: `1px solid ${FIORI.border}`,
            '&:last-child': { borderRight: 'none', marginRight: 0, paddingRight: 0 },
        },

        // buttons: keep Quill's native box, just round + tint on hover/active
        '& .ql-toolbar.ql-snow button': {
            height: 26,
            borderRadius: '0.25rem',
            color: FIORI.textSecondary,
            transition: 'background-color 0.1s ease, color 0.1s ease',
        },
        '& .ql-toolbar.ql-snow button:hover': {
            backgroundColor: FIORI.hover,
            color: FIORI.textPrimary,
        },
        '& .ql-toolbar.ql-snow button.ql-active': {
            backgroundColor: FIORI.brandBg,
            color: FIORI.brand,
        },
        // the "Normal / Heading" dropdown label — round + tint, never a fixed width
        '& .ql-toolbar.ql-snow .ql-picker.ql-header': {
            color: FIORI.textSecondary,
        },
        '& .ql-toolbar.ql-snow .ql-picker-label': {
            borderRadius: '0.25rem',
            transition: 'background-color 0.1s ease',
        },
        '& .ql-toolbar.ql-snow .ql-picker-label:hover, & .ql-toolbar.ql-snow .ql-picker.ql-expanded .ql-picker-label': {
            backgroundColor: FIORI.hover,
            color: FIORI.textPrimary,
        },
        // Quill renders button glyphs as inline SVG with stroke/fill classes —
        // recolour those to follow the button state above (currentColor).
        '& .ql-toolbar.ql-snow .ql-stroke': { stroke: 'currentColor' },
        '& .ql-toolbar.ql-snow .ql-fill, & .ql-toolbar.ql-snow .ql-stroke.ql-fill': { fill: 'currentColor' },
        '& .ql-toolbar.ql-snow .ql-picker-label .ql-stroke': { stroke: 'currentColor' },
        '& .ql-toolbar.ql-snow .ql-picker-options': {
            backgroundColor: FIORI.surface,
            border: `1px solid ${FIORI.borderStrong}`,
            borderRadius: '0.375rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            padding: '4px',
        },

        // editor body — Fiori type ramp + comfortable padding
        '& .ql-container.ql-snow': {
            fontFamily: 'inherit',
            fontSize: '0.875rem',
        },
        '& .ql-editor': {
            minHeight: 180,
            padding: '10px 12px',
            color: FIORI.textPrimary,
            lineHeight: 1.5,
        },
        '& .ql-editor.ql-blank::before': {
            color: FIORI.textSecondary,
            fontStyle: 'normal',
            left: 12,
            right: 12,
        },

        // Fiori display mode: drop the editing chrome, show the formatted text
        // on a muted surface. Spread last so it wins over the rules above.
        ...(readOnly && {
            bgcolor: FIORI.headerBg,
            '&:focus-within': { borderColor: border },
            '& .ql-toolbar.ql-snow': { display: 'none' },
            '& .ql-editor': { minHeight: 'auto', color: FIORI.textPrimary, padding: '10px 12px' },
        }),
    };
}

export default function RichTextEditor({ value, onChange, placeholder, readOnly, imageUploadUrl, valueState = 'none' }: RichTextEditorProps) {
    const [Quill, setQuill] = useState<ComponentType<any> | null>(null);
    const quillRef = useRef<any>(null);

    useEffect(() => {
        import('react-quill-new').then((module) => {
            setQuill(() => module.default);
        });
    }, []);

    // Quill เรียก handler นี้แบบไม่ผูก `this` มาให้ (ปกติมันเรียกผ่าน toolbar
    // module ของตัวเองที่ bind `this` เป็น quill instance ไว้ให้ — แต่ตรงนี้
    // เข้าถึง editor ผ่าน quillRef ตรงๆ แทน จะได้ไม่ต้องพึ่ง `this` เลย) เปิด
    // file picker เอง, อัปโหลด, แล้วแทรก <img> ที่ตำแหน่ง cursor ปัจจุบัน
    const imageHandler = useMemo(
        () => () => {
            if (!imageUploadUrl) return;
            const editor = quillRef.current?.getEditor?.();
            if (!editor) return;

            const range = editor.getSelection(true);
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('image', file);

                try {
                    const response = await fetch(imageUploadUrl, {
                        method: 'POST',
                        headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
                        body: formData,
                    });
                    if (!response.ok) return;
                    const { url } = await response.json();
                    const insertAt = range?.index ?? editor.getLength();
                    editor.insertEmbed(insertAt, 'image', url, 'user');
                    editor.setSelection(insertAt + 1, 0, 'user');
                } catch {
                    // อัปโหลดไม่สำเร็จ (เช่นเน็ตหลุด) — ไม่แทรกอะไรเข้าไป ผู้ใช้กดปุ่มลองใหม่ได้เอง
                }
            };
            input.click();
        },
        [imageUploadUrl],
    );

    const modules = useMemo(
        () => ({
            toolbar: {
                container: [
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link', ...(imageUploadUrl ? ['image'] : [])],
                    ['clean'],
                ],
                handlers: imageUploadUrl ? { image: imageHandler } : {},
            },
        }),
        [imageUploadUrl, imageHandler],
    );

    if (!Quill) {
        return (
            <Box
                sx={{
                    minHeight: 220,
                    border: `1px solid ${FIORI.borderStrong}`,
                    borderRadius: '0.375rem',
                    bgcolor: FIORI.surface,
                }}
            />
        );
    }

    return (
        <Box sx={fioriQuillSx(valueState, Boolean(readOnly))}>
            <Quill
                ref={quillRef}
                theme="snow"
                value={value}
                modules={modules}
                // Quill fires onChange for ANY content change, including its own
                // internal re-normalization of the `value` prop into its canonical
                // HTML shape (e.g. plain text with literal \n, as raw-imported or
                // seeded data has, gets rewritten into <p> tags on mount). Passing
                // that straight to a controlled `onChange` feeds the "normalized"
                // HTML back in as the new `value`, which can normalize again on the
                // next render — an infinite React "Maximum update depth exceeded"
                // loop that freezes the whole page. `source` distinguishes real
                // typing ('user') from Quill's own programmatic changes ('api'/
                // 'silent') — only the former should ever reach the parent.
                onChange={(content: string, _delta: unknown, source: string) => {
                    if (source === 'user') {
                        onChange(content);
                    }
                }}
                placeholder={placeholder}
                readOnly={readOnly}
            />
        </Box>
    );
}
