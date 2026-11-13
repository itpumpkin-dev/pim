import '@ui5/webcomponents-icons/dist/exit-full-screen.js';
import '@ui5/webcomponents-icons/dist/full-screen.js';
import { Button, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';

import styles from './marketplace.module.css';

/**
 * "ขยายเต็มจอ" ของ step ในหน้า Map สินค้า (PlatformEditPanel / PlatformPushPanel) — ตอนเต็มจอ panel ถูกยกขึ้น
 * top layer ของ browser (Popover API: `popover="manual"` + showPopover()) แล้วปักทับทั้ง viewport. top layer
 * หลุดจาก stacking context / กรอบของ layout (ถ้าแค่ `position: fixed` ใน SectionCard จะโดนเมนูข้างและ header ทับ)
 * โดยไม่ย้าย DOM และไม่ remount — ค่าที่แก้ค้างไว้ (แกลเลอรี, รูปที่เลือกนำเข้า, TinyMCE iframe) อยู่ครบ.
 * (เดิมใช้ portal ไป <body> ซึ่ง React mount ทั้ง panel ใหม่ทุกครั้งที่สลับ — state ที่ยังไม่บันทึกหาย)
 * popover ที่ UI5 เปิดทีหลัง (Select, Dialog, confirm) ขึ้น top layer ซ้อนทับ panel ได้ตามปกติ.
 *
 * ใช้: `ref={fs.panelRef}` + `className={fs.panelClassName}` ที่ root ของ panel, `fs.title` ไว้บนสุด,
 * `fs.toggleButton` ใน toolbar และ `className={fs.toolbarClassName}` ให้ toolbar (ค้างบนสุดตอนเลื่อน).
 */
export function useFullscreenPanel(title: string) {
    const [fullscreen, setFullscreen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = panelRef.current;
        if (!fullscreen || !el || typeof el.showPopover !== 'function') return;

        el.setAttribute('popover', 'manual');
        el.showPopover();
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = prevOverflow;
            if (el.matches(':popover-open')) el.hidePopover();
            el.removeAttribute('popover');
        };
    }, [fullscreen]);

    const label = fullscreen ? 'ออกจากโหมดเต็มจอ' : 'ขยายเต็มจอ';

    return {
        fullscreen,
        panelRef,
        panelClassName: fullscreen ? styles.editFullscreen : undefined,
        toolbarClassName: fullscreen ? styles.editFullscreenToolbar : undefined,
        /** หัวข้อของ step — โชว์เฉพาะตอนเต็มจอ (ปกติหัวข้ออยู่ใน SectionCard แล้ว) */
        title: fullscreen ? (
            <Title level="H5" size="H5" wrappingType="Normal">
                {title}
            </Title>
        ) : null,
        toggleButton: (
            <Button
                design="Transparent"
                icon={fullscreen ? 'exit-full-screen' : 'full-screen'}
                tooltip={label}
                accessibleName={label}
                onClick={() => setFullscreen((v) => !v)}
            />
        ),
    };
}
