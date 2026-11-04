/**
 * Navigates to `href` through a temporary `<a>` — the UI5 `Button` can't be
 * rendered as an anchor, so download buttons that used to be
 * `<Button component="a" href>` click a throwaway link instead (same
 * browser behaviour: an attachment response downloads without leaving the page).
 */
export function followLink(href: string, options: { download?: boolean | string; newTab?: boolean } = {}) {
    const anchor = document.createElement('a');
    anchor.href = href;
    if (options.download !== undefined && options.download !== false) {
        anchor.download = typeof options.download === 'string' ? options.download : '';
    }
    if (options.newTab) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
    }
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
