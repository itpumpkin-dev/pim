import { SvgIcon, type SvgIconProps } from '@mui/material';
import { pathData as addPath, viewBox as addViewBox } from '@ui5/webcomponents-icons/dist/v5/add.js';
import { pathData as badgePath, viewBox as badgeViewBox } from '@ui5/webcomponents-icons/dist/v5/badge.js';
import { pathData as buildingPath, viewBox as buildingViewBox } from '@ui5/webcomponents-icons/dist/v5/building.js';
import { pathData as chainLinkPath, viewBox as chainLinkViewBox } from '@ui5/webcomponents-icons/dist/v5/chain-link.js';
import { pathData as cancelPath, viewBox as cancelViewBox } from '@ui5/webcomponents-icons/dist/v5/decline.js';
import { pathData as copyPath, viewBox as copyViewBox } from '@ui5/webcomponents-icons/dist/v5/copy.js';
import { pathData as databasePath, viewBox as databaseViewBox } from '@ui5/webcomponents-icons/dist/v5/database.js';
import { pathData as deletePath, viewBox as deleteViewBox } from '@ui5/webcomponents-icons/dist/v5/delete.js';
import { pathData as downloadPath, viewBox as downloadViewBox } from '@ui5/webcomponents-icons/dist/v5/download.js';
import { pathData as downloadFromCloudPath, viewBox as downloadFromCloudViewBox } from '@ui5/webcomponents-icons/dist/v5/download-from-cloud.js';
import { pathData as editPath, viewBox as editViewBox } from '@ui5/webcomponents-icons/dist/v5/edit.js';
import { pathData as employeePath, viewBox as employeeViewBox } from '@ui5/webcomponents-icons/dist/v5/employee.js';
import { pathData as filterPath, viewBox as filterViewBox } from '@ui5/webcomponents-icons/dist/v5/filter.js';
import { pathData as firstPagePath, viewBox as firstPageViewBox } from '@ui5/webcomponents-icons/dist/v5/sys-first-page.js';
import { pathData as globePath, viewBox as globeViewBox } from '@ui5/webcomponents-icons/dist/v5/globe.js';
import { pathData as groupPath, viewBox as groupViewBox } from '@ui5/webcomponents-icons/dist/v5/group.js';
import { pathData as lastPagePath, viewBox as lastPageViewBox } from '@ui5/webcomponents-icons/dist/v5/sys-last-page.js';
import { pathData as logPath, viewBox as logViewBox } from '@ui5/webcomponents-icons/dist/v5/log.js';
import { pathData as navBackPath, viewBox as navBackViewBox } from '@ui5/webcomponents-icons/dist/v5/nav-back.js';
import { pathData as playPath, viewBox as playViewBox } from '@ui5/webcomponents-icons/dist/v5/play.js';
import { pathData as productPath, viewBox as productViewBox } from '@ui5/webcomponents-icons/dist/v5/product.js';
import { pathData as rolePath, viewBox as roleViewBox } from '@ui5/webcomponents-icons/dist/v5/role.js';
import { pathData as savePath, viewBox as saveViewBox } from '@ui5/webcomponents-icons/dist/v5/save.js';
import { pathData as searchPath, viewBox as searchViewBox } from '@ui5/webcomponents-icons/dist/v5/search.js';
import { pathData as settingsPath, viewBox as settingsViewBox } from '@ui5/webcomponents-icons/dist/v5/settings.js';
import { pathData as slimArrowDownPath, viewBox as slimArrowDownViewBox } from '@ui5/webcomponents-icons/dist/v5/slim-arrow-down.js';
import { pathData as slimArrowLeftPath, viewBox as slimArrowLeftViewBox } from '@ui5/webcomponents-icons/dist/v5/slim-arrow-left.js';
import { pathData as slimArrowRightPath, viewBox as slimArrowRightViewBox } from '@ui5/webcomponents-icons/dist/v5/slim-arrow-right.js';
import { pathData as sortPath, viewBox as sortViewBox } from '@ui5/webcomponents-icons/dist/v5/sort.js';
import { pathData as switchClassesPath, viewBox as switchClassesViewBox } from '@ui5/webcomponents-icons/dist/v5/switch-classes.js';
import { pathData as syncPath, viewBox as syncViewBox } from '@ui5/webcomponents-icons/dist/v5/synchronize.js';
import { pathData as tagPath, viewBox as tagViewBox } from '@ui5/webcomponents-icons/dist/v5/tag.js';
import { pathData as taskPath, viewBox as taskViewBox } from '@ui5/webcomponents-icons/dist/v5/task.js';
import { pathData as translatePath, viewBox as translateViewBox } from '@ui5/webcomponents-icons/dist/v5/translate.js';
import { pathData as uploadPath, viewBox as uploadViewBox } from '@ui5/webcomponents-icons/dist/v5/upload-to-cloud.js';
import { pathData as viewPath, viewBox as viewViewBox } from '@ui5/webcomponents-icons/dist/v5/show.js';

/**
 * Pilot batch — SAP-icons (webcomponents.SAP-icons, "Horizon"/v5 set, same
 * set shown at https://ui5.sap.com/.../iconExplorer). Started as ~15 icons
 * covering the highest-traffic MUI icon names from a codebase-wide usage
 * scan (Search, Edit, Delete, Save, Close, pagination, ...); grew a second
 * batch (the `nav*` keys) for the sidebar's NavSecondary root items. Each
 * icon is a static import of just its own tiny module (pathData + viewBox,
 * synchronous — no font file, no CDN, no runtime theme lookup) so this stays
 * tree-shakeable as more names get added here later, one PILOT_ICONS entry
 * at a time — no wildcard "import every @ui5 icon" anywhere.
 *
 * Naming here is our own curated semantic name (matching what the MUI icon
 * it replaces was used for, or — for `nav*` — what sidebar item it labels),
 * not always identical to the SAP-icons name. `close`/`cancel` both point at
 * "decline" (SAP-icons has no separate glyph for each); `chevronRight`/
 * `expandMore` both point at slim-arrow-right/down respectively, matching
 * how MUI's ChevronRightIcon/ExpandMoreIcon were actually used (row-expand
 * toggles), not the also-plausible navigation-*-arrow pair (page/tab nav).
 * `navExport` reuses the same "upload-to-cloud" glyph as `upload` (exporting
 * data out of the system reads the same as uploading it elsewhere) — no
 * separate SAP-icons glyph exists for the two concepts.
 */
const PILOT_ICONS = {
    search: { pathData: searchPath, viewBox: searchViewBox },
    edit: { pathData: editPath, viewBox: editViewBox },
    delete: { pathData: deletePath, viewBox: deleteViewBox },
    save: { pathData: savePath, viewBox: saveViewBox },
    add: { pathData: addPath, viewBox: addViewBox },
    close: { pathData: cancelPath, viewBox: cancelViewBox },
    cancel: { pathData: cancelPath, viewBox: cancelViewBox },
    back: { pathData: navBackPath, viewBox: navBackViewBox },
    firstPage: { pathData: firstPagePath, viewBox: firstPageViewBox },
    lastPage: { pathData: lastPagePath, viewBox: lastPageViewBox },
    chevronLeft: { pathData: slimArrowLeftPath, viewBox: slimArrowLeftViewBox },
    chevronRight: { pathData: slimArrowRightPath, viewBox: slimArrowRightViewBox },
    expandMore: { pathData: slimArrowDownPath, viewBox: slimArrowDownViewBox },
    sync: { pathData: syncPath, viewBox: syncViewBox },
    filter: { pathData: filterPath, viewBox: filterViewBox },
    sort: { pathData: sortPath, viewBox: sortViewBox },
    copy: { pathData: copyPath, viewBox: copyViewBox },
    download: { pathData: downloadPath, viewBox: downloadViewBox },
    upload: { pathData: uploadPath, viewBox: uploadViewBox },
    play: { pathData: playPath, viewBox: playViewBox },
    view: { pathData: viewPath, viewBox: viewViewBox },

    // ── nav-secondary.tsx (แถบ sidebar ที่สอง — "double sidebar") ──
    // ไอคอนของ root item แต่ละกลุ่ม (depth 0 เท่านั้น — item ที่ลึกกว่านั้นไม่มี
    // ไอคอน ตรงกับสเปก Fiori Side Navigation จริงๆ ที่มีแค่ navigation list
    // item เท่านั้นที่ถือไอคอน ไม่ใช่ child item) ดู app-sidebar.tsx's
    // useMainNavItems() ว่า iconName ไหนผูกกับ item ไหนบ้าง
    navProduct: { pathData: productPath, viewBox: productViewBox },
    navMaster: { pathData: databasePath, viewBox: databaseViewBox },
    navAttributes: { pathData: tagPath, viewBox: tagViewBox },
    navManagement: { pathData: settingsPath, viewBox: settingsViewBox },
    navImport: { pathData: downloadFromCloudPath, viewBox: downloadFromCloudViewBox },
    navExport: { pathData: uploadPath, viewBox: uploadViewBox },
    navJobTracker: { pathData: taskPath, viewBox: taskViewBox },
    navWooConvert: { pathData: switchClassesPath, viewBox: switchClassesViewBox },
    navChannels: { pathData: chainLinkPath, viewBox: chainLinkViewBox },
    navUsers: { pathData: employeePath, viewBox: employeeViewBox },
    navUserGroups: { pathData: groupPath, viewBox: groupViewBox },
    navDepartments: { pathData: buildingPath, viewBox: buildingViewBox },
    navJobPositions: { pathData: badgePath, viewBox: badgeViewBox },
    navRoles: { pathData: rolePath, viewBox: roleViewBox },
    navLocales: { pathData: globePath, viewBox: globeViewBox },
    navTranslationProviders: { pathData: translatePath, viewBox: translateViewBox },
    navActivityLogs: { pathData: logPath, viewBox: logViewBox },
} as const;

export type IconName = keyof typeof PILOT_ICONS;

/**
 * Drop-in replacement for a `@mui/icons-material` icon component — built on
 * MUI's own `SvgIcon` (the same base every `@mui/icons-material` icon uses
 * internally), so `fontSize`/`color`/`sx` behave identically to whatever
 * `<XyzIcon fontSize="small" />` call site this is replacing. `viewBox` is
 * set per-icon from SAP-icons' own data (all "0 0 16 16" for this pilot
 * batch) rather than SvgIcon's 24x24 default.
 */
export function Icon({ name, ...svgIconProps }: { name: IconName } & SvgIconProps) {
    const icon = PILOT_ICONS[name];

    return (
        <SvgIcon viewBox={icon.viewBox} {...svgIconProps}>
            <path d={icon.pathData} />
        </SvgIcon>
    );
}
