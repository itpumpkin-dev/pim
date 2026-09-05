import { useResolvedAppearance } from '@/hooks/use-appearance';
import { xsrfToken } from '@/lib/csrf';
import { FIORI } from '@/lib/fiori-style';
import { Box, type SxProps, type Theme } from '@mui/material';
import { useEffect, useMemo, useState, type ComponentType } from 'react';

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

// เฉพาะภาษาละติน/ไทย ตรงกับ stack จริงที่ theme.ts ตั้งให้ <body> ของทั้งแอป —
// เนื้อหาที่พิมพ์ในนี้ (ชื่อ/รายละเอียดสินค้าภาษาไทยเป็นหลัก) เลยไม่หลุดไปใช้ฟอนต์
// เริ่มต้นของ browser ข้าง iframe ที่ไม่มีกลีบไทยรองรับ
const CONTENT_FONT_FAMILY = '"72","Sarabun",ui-sans-serif,system-ui,sans-serif';

// TinyMCE เรนเดอร์เนื้อหาที่แก้ไขได้ใน <iframe> ของมันเอง (คนละ document กับ
// หน้าแอป) — CSS custom property แบบ var(--fiori-*) ที่ประกาศไว้ที่ :root ของ
// หน้าแอปเลยข้ามเข้าไปใน iframe ไม่ได้ ต้องฝังค่าสีจริง (hex) ที่ตรงกับแต่ละธีม
// เข้าไปใน content_style เองแทน (ตรงกับ --fiori-* ใน resources/css/app.css)
const CONTENT_PALETTE = {
    light: { bg: '#ffffff', text: '#1d2d3e', muted: '#6a6d70', link: '#0070f2', border: '#d9d9d9' },
    dark: { bg: '#1e2124', text: '#e8eaed', muted: '#9aa4ae', link: '#4da3ff', border: '#383c40' },
} as const;

function contentStyle(mode: 'light' | 'dark'): string {
    const p = CONTENT_PALETTE[mode];
    return `
        body {
            margin: 0;
            padding: 10px 12px;
            background: ${p.bg};
            color: ${p.text};
            font-family: ${CONTENT_FONT_FAMILY};
            font-size: 0.875rem;
            line-height: 1.5;
        }
        body.mce-content-body[data-mce-placeholder]::before { color: ${p.muted}; font-style: normal; }
        p { margin: 0 0 0.75em; }
        p:last-child { margin-bottom: 0; }
        ul, ol { margin: 0 0 0.75em; padding-left: 1.5em; }
        h1, h2, h3 { margin: 0.5em 0; font-weight: 700; }
        a { color: ${p.link}; }
        img { max-width: 100%; height: auto; }
        hr { border: none; border-top: 1px solid ${p.border}; }
    `;
}

/**
 * SAP Fiori (Horizon) "Rich Text Editor" look for TinyMCE's oxide skin — same
 * intent as the old fioriQuillSx() this replaced (ดู git history): one
 * bordered control, flat toolbar strip with grouped icon buttons, brand-tinted
 * active state. TinyMCE's outer chrome (.tox-*) lives in the main document
 * (not the iframe), so it can use the same var(--fiori-*) tokens as the rest
 * of the app and stays theme-reactive automatically — only the *inner* iframe
 * content needs the hardcoded contentStyle() above.
 */
function fioriTinyMceSx(valueState: 'none' | 'error', readOnly: boolean): SxProps<Theme> {
    const border = valueState === 'error' ? FIORI.error : FIORI.borderStrong;
    const borderWidth = valueState === 'error' ? '2px' : '1px';

    return {
        borderRadius: '0.375rem',
        border: `${borderWidth} solid ${border}`,
        bgcolor: valueState === 'error' ? FIORI.errorBg : FIORI.surface,
        overflow: 'hidden',
        transition: 'border-color 0.1s ease',
        '&:focus-within': { borderColor: FIORI.brand },

        // TinyMCE draws its own outer border/shadow on .tox-tinymce — drop it,
        // the wrapper above owns the outline now (same move as .ql-toolbar/
        // .ql-container in the old Quill version).
        '& .tox.tox-tinymce': { border: 'none', boxShadow: 'none', borderRadius: 0 },
        '& .tox .tox-editor-header': {
            borderBottom: `1px solid ${FIORI.border}`,
            bgcolor: FIORI.headerBg,
            boxShadow: 'none',
            padding: '5px 8px',
            zIndex: 0,
        },
        '& .tox .tox-toolbar__group': {
            marginRight: '8px',
            paddingRight: '8px',
            borderRight: `1px solid ${FIORI.border}`,
            '&:last-child': { borderRight: 'none', marginRight: 0, paddingRight: 0 },
        },
        '& .tox .tox-tbtn': {
            height: 26,
            borderRadius: '0.25rem',
            color: FIORI.textSecondary,
        },
        '& .tox .tox-tbtn:hover': { bgcolor: FIORI.hover, color: FIORI.textPrimary },
        '& .tox .tox-tbtn--enabled, & .tox .tox-tbtn--enabled:hover': { bgcolor: FIORI.brandBg, color: FIORI.brand },
        '& .tox .tox-edit-area__iframe': { bgcolor: 'transparent' },

        // Fiori display mode: drop the toolbar entirely, show the formatted
        // content on a muted surface — matches readOnly mode of the old Quill
        // component (toolbar hidden via display:none there; here `toolbar:
        // false` in init already stops it rendering, this just handles the
        // surface tint).
        ...(readOnly && { bgcolor: FIORI.headerBg }),
    };
}

/**
 * WYSIWYG editor for `textarea`-type attributes (product description, etc.)
 * — ตัวเดียวที่ใช้ทั้งแอป (ดู RichTextControl ใน products/edit.tsx) แต่ก่อนเป็น
 * react-quill-new (Quill) ตอนนี้เปลี่ยนมาเป็น TinyMCE ตามที่ user ขอ (self-hosted,
 * ไม่ต้องมี API key/เรียกออกอินเทอร์เน็ต — import จาก node_modules ตรงๆ) เก็บ
 * external contract (value/onChange เป็น HTML string ตรงๆ) ไว้เหมือนเดิมทุก
 * ประการ เลยไม่กระทบข้อมูลเก่าที่ Quill เคยเขียนไว้ หรือโค้ดฝั่งที่เรียกใช้เลย
 */
export default function RichTextEditor({ value, onChange, placeholder, readOnly, imageUploadUrl, valueState = 'none' }: RichTextEditorProps) {
    // โหลดแบบ dynamic import ทั้งก้อน (core + icon/theme/model + ปลั๊กอินที่ใช้
    // + ตัว React wrapper เอง) เหมือนที่ react-quill-new เคยทำ — TinyMCE หนักกว่า
    // Quill พอสมควร ไม่อยากให้ไปพ่วงกับ initial bundle ของหน้า Edit Product ทั้งที่
    // ไม่ใช่ทุกสินค้าจะมี attribute แบบ textarea ให้ใช้จริง
    const [Editor, setEditor] = useState<ComponentType<any> | null>(null);

    useEffect(() => {
        let cancelled = false;

        // ต้อง import ทีละตัวตามลำดับ (await เรียงกัน) ห้ามยิงพร้อมกันด้วย
        // Promise.all — ไฟล์พวกนี้ (icons/theme/model/ปลั๊กอิน) ไม่ได้ import
        // 'tinymce/tinymce' เป็น dependency ของตัวเองแบบ ES module ปกติ แค่
        // คาดหวังว่า global `window.tinymce` จาก core จะมีอยู่แล้วตอนโค้ดระดับบนสุด
        // ของมันรัน (เขียนไว้สำหรับโหลดแบบ <script> เรียงลำดับ/require ทีละบรรทัด
        // แบบเดิม) Promise.all ไม่การันตีลำดับ evaluation ของ dynamic import แต่ละตัว
        // เลยเจอ "tinymce is not defined" ได้ถ้า icons/theme/model โหลดเสร็จ (จบ
        // การ evaluate) ก่อน core
        (async () => {
            await import('tinymce/tinymce');
            await import('tinymce/icons/default');
            await import('tinymce/themes/silver');
            await import('tinymce/models/dom');
            await import('tinymce/skins/ui/oxide/skin.css');
            await import('tinymce/plugins/link');
            await import('tinymce/plugins/lists');
            await import('tinymce/plugins/image');
            await import('tinymce/plugins/code');
            await import('tinymce/plugins/autoresize');
            const tinymceReact = await import('@tinymce/tinymce-react');
            if (!cancelled) setEditor(() => tinymceReact.Editor);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // ตัว toolbar/menu chrome (.tox-*) อยู่ใน document หลัก เลย re-theme ตาม
    // light/dark ผ่าน var(--fiori-*) ใน sx ได้ปกติ (ไม่ต้อง remount) — แต่เนื้อหา
    // ที่แก้ไขได้จริงอยู่ใน iframe แยก document ซึ่ง var() ข้ามเข้าไปไม่ถึง เลยต้อง
    // อาศัย contentStyle() (hex ตรงๆ) แทน ผูกกับ key ด้านล่างเพื่อบังคับ remount
    // ตอนสลับธีม (content_style เป็นค่าที่ TinyMCE อ่านแค่ตอน init เท่านั้น ไม่ใช่
    // reactive prop)
    const { resolved } = useResolvedAppearance();

    const imagesUploadHandler = useMemo(
        () =>
            imageUploadUrl
                ? (blobInfo: { blob: () => Blob; filename: () => string }) =>
                      new Promise<string>((resolve, reject) => {
                          const formData = new FormData();
                          formData.append('image', blobInfo.blob(), blobInfo.filename());

                          fetch(imageUploadUrl, {
                              method: 'POST',
                              headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
                              body: formData,
                          })
                              .then((response) => {
                                  if (!response.ok) throw new Error('upload failed');
                                  return response.json();
                              })
                              .then(({ url }) => resolve(url))
                              // อัปโหลดไม่สำเร็จ (เช่นเน็ตหลุด) — reject ด้วยข้อความให้ TinyMCE
                              // โชว์ error เอง ไม่แทรกอะไรเข้าเนื้อหา ผู้ใช้กดปุ่มลองใหม่ได้เอง
                              .catch(() => reject('Image upload failed.'));
                      })
                : undefined,
        [imageUploadUrl],
    );

    if (!Editor) {
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
        <Box sx={fioriTinyMceSx(valueState, Boolean(readOnly))}>
            <Editor
                key={resolved}
                licenseKey="gpl"
                value={value}
                disabled={Boolean(readOnly)}
                onEditorChange={(content: string) => onChange(content)}
                init={{
                    branding: false,
                    promotion: false,
                    menubar: false,
                    statusbar: false,
                    // ปิด TinyMCE's "toolbar sticks to the viewport top while scrolling"
                    // เอง — หน้านี้มีหลาย field แบบ textarea วางเรียงกันในกล่อง scroll
                    // เดียวกัน (scrollBodyRef) ถ้าเปิดไว้ toolbar ของแต่ละ instance จะแย่งกัน
                    // "ติด" ที่ขอบบนสุดของกล่อง scroll นั้น ลอยทับแท็บ/ฟิลด์อื่นด้านบนแทนที่
                    // จะเลื่อนไปกับกล่องของตัวเองตามปกติ
                    toolbar_sticky: false,
                    toolbar: readOnly
                        ? false
                        : [
                              'blocks',
                              'bold italic underline strikethrough',
                              'bullist numlist',
                              imageUploadUrl ? 'link image' : 'link',
                              'code',
                              'removeformat',
                          ].join(' | '),
                    // autoresize: iframe สูงขึ้นตามเนื้อหาแล้วให้หน้า scroll เอง (แทนที่
                    // จะเกิด scrollbar ซ้อนในกรอบเล็กๆ) min_height ด้านล่างเป็นแค่ความสูง
                    // เริ่มต้น/ต่ำสุด — พฤติกรรมเดียวกับ .ql-editor { min-height } ของ Quill เดิม
                    plugins: ['link', 'lists', 'image', 'code', 'autoresize'],
                    placeholder,
                    min_height: 280,
                    // skin.css ถูก import มือไว้ข้างบนแล้ว (ครั้งเดียว, ไม่ผูกกับธีม —
                    // ดู docblock ของ fioriTinyMceSx()) ปิด auto-load ของ TinyMCE เอง
                    // ไปเลยเพื่อไม่ให้มันพยายามยิง fetch หา URL ที่ไม่มีจริงในโปรเจกต์นี้
                    skin: false,
                    // เช่นเดียวกับ skin — ปิด default content CSS ของ TinyMCE เอง (ก็
                    // เป็น URL-based เหมือนกัน) แล้วเขียน content_style เองแทนทั้งหมด
                    content_css: false,
                    content_style: contentStyle(resolved),
                    images_upload_handler: imagesUploadHandler,
                }}
            />
        </Box>
    );
}
