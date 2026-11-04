// Each SAP-icons module's default export is its own registered name ("lab", …)
// and importing it registers the glyph, so the map below can never point at an
// icon that isn't loaded.
import buildingIcon from '@ui5/webcomponents-icons/dist/building.js';
import databaseIcon from '@ui5/webcomponents-icons/dist/database.js';
import factoryIcon from '@ui5/webcomponents-icons/dist/factory.js';
import gridIcon from '@ui5/webcomponents-icons/dist/grid.js';
import inventoryIcon from '@ui5/webcomponents-icons/dist/inventory.js';
import labIcon from '@ui5/webcomponents-icons/dist/lab.js';
import notesIcon from '@ui5/webcomponents-icons/dist/notes.js';
import nutritionActivityIcon from '@ui5/webcomponents-icons/dist/nutrition-activity.js';
import overflowIcon from '@ui5/webcomponents-icons/dist/overflow.js';
import paintBucketIcon from '@ui5/webcomponents-icons/dist/paint-bucket.js';
import presentIcon from '@ui5/webcomponents-icons/dist/present.js';
import retailStoreIcon from '@ui5/webcomponents-icons/dist/retail-store.js';
import scissorsIcon from '@ui5/webcomponents-icons/dist/scissors.js';
import settingsIcon from '@ui5/webcomponents-icons/dist/settings.js';
import shieldIcon from '@ui5/webcomponents-icons/dist/shield.js';
import shippingStatusIcon from '@ui5/webcomponents-icons/dist/shipping-status.js';
import technicalObjectIcon from '@ui5/webcomponents-icons/dist/technical-object.js';
import weatherProofingIcon from '@ui5/webcomponents-icons/dist/weather-proofing.js';
import wrenchIcon from '@ui5/webcomponents-icons/dist/wrench.js';

/** Generic fallback icon for an unmapped category. */
export const DEFAULT_CATEGORY_ICON_NAME: string = inventoryIcon;

/**
 * Category label -> SAP-icons (UI5) icon name, for `<Icon name={...} />` /
 * `icon={...}` on UI5 components. Product data is EAV-driven and has no icon
 * field of its own, so the display icon is resolved client-side from the
 * category name. Keys are the 19 real top-level category names from
 * CategoryTaxonomySeeder (database/data/categories.csv). Unmapped categories
 * fall back to a generic icon via getCategoryIconName().
 */
export const CATEGORY_ICON_NAMES: Record<string, string> = {
    เครื่องมือไฟฟ้า: wrenchIcon,
    อุปกรณ์เสริมเครื่องมือไฟฟ้า: scissorsIcon,
    เครื่องมือสำหรับช่างก่อสร้าง: buildingIcon,
    อุปกรณ์ฮาร์ดแวร์และมีดคัตเตอร์: technicalObjectIcon,
    เครื่องมือสำหรับงานช่างอุตสาหกรรม: factoryIcon,
    เครื่องมือลมและอุปกรณ์เสริม: weatherProofingIcon,
    อุปกรณ์เพื่อความปลอดภัย: shieldIcon,
    'เครื่องมือทำสวน-การเกษตรและเครื่องยนต์': nutritionActivityIcon,
    เคมีภัณฑ์และกาว: labIcon,
    กล่องเคริ่องมือและอุปกรณ์จัดเก็บ: inventoryIcon,
    เบ็ดเตล็ด: gridIcon,
    ปั๊มน้ำ: paintBucketIcon,
    บรรจุภัณฑ์: shippingStatusIcon,
    'Customer Brand': retailStoreIcon,
    วัตถุดิบ: databaseIcon,
    พรีเมี่ยมและของแถม: presentIcon,
    หมายเหตุ: notesIcon,
    อื่นๆ: overflowIcon,
    อะไหล่: settingsIcon,
};

export function getCategoryIconName(category: string): string {
    return CATEGORY_ICON_NAMES[category] ?? DEFAULT_CATEGORY_ICON_NAME;
}
