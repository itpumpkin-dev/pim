// Side-effect-only submodules TinyMCE ships for self-hosted/bundler usage
// (see resources/js/components/rich-text-editor.tsx) — plain JS, no shipped
// declaration files, and only ever imported for their registration side
// effect (never for a value), so an untyped ambient module is enough.
declare module 'tinymce/icons/default';
declare module 'tinymce/themes/silver';
declare module 'tinymce/models/dom';
declare module 'tinymce/plugins/*';
