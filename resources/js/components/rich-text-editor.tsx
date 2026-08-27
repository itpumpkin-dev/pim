import { xsrfToken } from '@/lib/csrf';
import { Box } from '@mui/material';
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
}

export default function RichTextEditor({ value, onChange, placeholder, readOnly, imageUploadUrl }: RichTextEditorProps) {
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
        return <Box sx={{ minHeight: 200, border: 1, borderColor: 'divider', borderRadius: 1 }} />;
    }

    return (
        <Box sx={{
            '& .ql-container': {
                minHeight: 200,
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.9rem',
            },
            '& .ql-toolbar': {
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
            }
        }}>
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
